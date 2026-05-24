/**
 * Edge Function: accept-friend-request
 *
 * Accept a pending friend request. Computes compatibility, transitions
 * FRIEND_REQ → FRIEND in Supabase, replaces SENT_REQUEST_TO with
 * bidirectional FRIENDS_WITH in Neo4j.
 *
 * POST /functions/v1/accept-friend-request
 * Body: { relationship_id, accepting_pet_id }
 *
 * See: 05_service_social_graph.md
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { ok, errorResponse, AppError, NotFoundError } from "../_shared/errors.ts";
import { assertPetOwner, createNotification, computeCompatibility } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const { relationship_id, accepting_pet_id } = await req.json();

    if (!relationship_id || !accepting_pet_id) {
      throw new AppError("VALIDATION_ERROR", "relationship_id and accepting_pet_id required", 400);
    }

    // 1. Verify caller owns accepting_pet_id
    await assertPetOwner(supabase, user.id, accepting_pet_id);

    // 2. Fetch relationship — must be FRIEND_REQ with to_pet_id = accepting_pet_id
    const { data: rel } = await supabase
      .from("pet_relationships")
      .select("id, from_pet_id, to_pet_id, rel_type")
      .eq("id", relationship_id)
      .single();

    if (!rel) throw new NotFoundError("Relationship not found");
    if (rel.rel_type !== "FRIEND_REQ") throw new AppError("INVALID_STATE", "Not a pending request", 409);
    if (rel.to_pet_id !== accepting_pet_id) throw new AppError("AUTH_FORBIDDEN", "Not the recipient", 403);

    // 3. Compute compatibility score via Neo4j
    const compatibility = await computeCompatibility(rel.from_pet_id, accepting_pet_id);
    const now = new Date().toISOString();

    // 4. Update Supabase: rel_type = FRIEND
    const { data: updated, error: updateError } = await supabase
      .from("pet_relationships")
      .update({ rel_type: "FRIEND", compatibility, updated_at: now })
      .eq("id", relationship_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // 5. In Neo4j: delete SENT_REQUEST_TO, create bidirectional FRIENDS_WITH
    await neo4jQuery(
      `
      MATCH (a:Pet {id: $from_pet_id}), (b:Pet {id: $to_pet_id})
      OPTIONAL MATCH (a)-[r:SENT_REQUEST_TO]->(b) DELETE r
      WITH a, b
      MERGE (a)-[f1:FRIENDS_WITH]->(b)
      SET f1.since = $since, f1.compatibility = $score
      MERGE (b)-[f2:FRIENDS_WITH]->(a)
      SET f2.since = $since, f2.compatibility = $score
      `,
      { from_pet_id: rel.from_pet_id, to_pet_id: accepting_pet_id, since: now, score: compatibility }
    );

    // 6. Notify requester: FRIEND_ACCEPTED
    const { data: fromPet } = await supabase
      .from("pets")
      .select("owner_id")
      .eq("id", rel.from_pet_id)
      .single();

    if (fromPet) {
      await createNotification(supabase, {
        recipient_id: fromPet.owner_id,
        type: "FRIEND_ACCEPTED",
        payload: { from_pet_id: rel.from_pet_id, to_pet_id: accepting_pet_id, compatibility },
      });
    }

    return ok(updated);
  } catch (error) {
    return errorResponse(error);
  }
});
