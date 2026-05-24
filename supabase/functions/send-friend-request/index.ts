/**
 * Edge Function: send-friend-request
 *
 * Send a friend request from one of the caller's pets to another pet.
 * Creates FRIEND_REQ in Supabase + SENT_REQUEST_TO in Neo4j.
 *
 * POST /functions/v1/send-friend-request
 * Body: { from_pet_id, to_pet_id }
 *
 * See: 05_service_social_graph.md
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { created, errorResponse, AppError } from "../_shared/errors.ts";
import { assertPetOwner, createNotification } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const { from_pet_id, to_pet_id } = await req.json();

    if (!from_pet_id || !to_pet_id) {
      throw new AppError("VALIDATION_ERROR", "from_pet_id and to_pet_id are required", 400);
    }

    // 1. Verify caller owns from_pet_id
    await assertPetOwner(supabase, user.id, from_pet_id);

    // 2. Verify to_pet exists and is active
    const { data: toPet } = await supabase
      .from("pets")
      .select("id, owner_id, name")
      .eq("id", to_pet_id)
      .eq("is_active", true)
      .single();

    if (!toPet) throw new AppError("NOT_FOUND", "Target pet not found", 404);

    // Cannot request your own pet
    if (toPet.owner_id === user.id) {
      throw new AppError("INVALID_REQUEST", "Cannot send friend request to your own pet", 400);
    }

    // 3. Check for existing relationship
    const { data: existing } = await supabase
      .from("pet_relationships")
      .select("rel_type")
      .or(
        `and(from_pet_id.eq.${from_pet_id},to_pet_id.eq.${to_pet_id}),and(from_pet_id.eq.${to_pet_id},to_pet_id.eq.${from_pet_id})`
      )
      .maybeSingle();

    if (existing?.rel_type === "FRIEND") throw new AppError("ALREADY_FRIENDS", "Already friends", 409);
    if (existing?.rel_type === "BLOCKED") throw new AppError("BLOCKED", "Blocked", 403);
    if (existing?.rel_type === "FRIEND_REQ") throw new AppError("REQUEST_PENDING", "Request already pending", 409);

    // 4. Get from_pet name for notification
    const { data: fromPet } = await supabase
      .from("pets")
      .select("name")
      .eq("id", from_pet_id)
      .single();

    // 5. Insert into Supabase
    const { data: rel, error: insertError } = await supabase
      .from("pet_relationships")
      .insert({ from_pet_id, to_pet_id, rel_type: "FRIEND_REQ" })
      .select()
      .single();

    if (insertError) throw insertError;

    // 6. Create pending edge in Neo4j
    await neo4jQuery(
      `
      MATCH (a:Pet {id: $from_pet_id}), (b:Pet {id: $to_pet_id})
      MERGE (a)-[:SENT_REQUEST_TO {created_at: $created_at}]->(b)
      `,
      { from_pet_id, to_pet_id, created_at: rel.created_at }
    );

    // 7. Notify to_pet owner
    await createNotification(supabase, {
      recipient_id: toPet.owner_id,
      type: "FRIEND_REQUEST",
      payload: { from_pet_id, to_pet_id, from_pet_name: fromPet?.name || "" },
    });

    return created(rel);
  } catch (error) {
    return errorResponse(error);
  }
});
