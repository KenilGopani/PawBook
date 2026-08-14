/**
 * Edge Function: block-pet
 *
 * Block a pet. Enforced immediately in Supabase (via RLS), then synced to Neo4j.
 *
 * POST /functions/v1/block-pet
 * Body: { from_pet_id, to_pet_id }
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { AppError, errorResponse, ok } from "../_shared/errors.ts";
import { assertPetOwner } from "../_shared/helpers.ts";

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

    if (from_pet_id === to_pet_id) {
      throw new AppError("INVALID_REQUEST", "Cannot block yourself", 400);
    }

    // 2. Delete any existing relationship in Supabase (friendship or request)
    await supabase
      .from("pet_relationships")
      .delete()
      .or(
        `and(from_pet_id.eq.${from_pet_id},to_pet_id.eq.${to_pet_id}),and(from_pet_id.eq.${to_pet_id},to_pet_id.eq.${from_pet_id})`,
      );

    // 3. Insert BLOCKED relationship in Supabase
    const { data: blockedRel, error: insertError } = await supabase
      .from("pet_relationships")
      .insert({
        from_pet_id,
        to_pet_id,
        rel_type: "BLOCKED",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 4. In Neo4j: delete FRIENDS_WITH and SENT_REQUEST_TO in both directions, create BLOCKED edge
    await neo4jQuery(
      `
      MATCH (a:Pet {id: $from_pet_id}), (b:Pet {id: $to_pet_id})
      OPTIONAL MATCH (a)-[r1:FRIENDS_WITH]-(b) DELETE r1
      OPTIONAL MATCH (a)-[r2:SENT_REQUEST_TO]-(b) DELETE r2
      MERGE (a)-[b_edge:BLOCKED {created_at: $created_at}]->(b)
      `,
      { from_pet_id, to_pet_id, created_at: blockedRel.created_at },
    );

    return ok({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
