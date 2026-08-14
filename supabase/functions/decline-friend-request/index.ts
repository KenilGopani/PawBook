/**
 * Edge Function: decline-friend-request
 * Either side can decline/cancel. Deletes relationship from both DBs.
 *
 * POST /functions/v1/decline-friend-request
 * Body: { relationship_id, pet_id }
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { AppError, errorResponse, NotFoundError, ok } from "../_shared/errors.ts";
import { assertPetOwner } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const { relationship_id, pet_id } = await req.json();

    if (!relationship_id || !pet_id) {
      throw new AppError("VALIDATION_ERROR", "relationship_id and pet_id required", 400);
    }

    await assertPetOwner(supabase, user.id, pet_id);

    // Fetch relationship — must be FRIEND_REQ
    const { data: rel } = await supabase
      .from("pet_relationships")
      .select("id, from_pet_id, to_pet_id, rel_type")
      .eq("id", relationship_id)
      .single();

    if (!rel) throw new NotFoundError("Relationship not found");
    if (rel.rel_type !== "FRIEND_REQ") {
      throw new AppError("INVALID_STATE", "Not a pending request", 409);
    }

    // Verify caller is either side
    if (rel.from_pet_id !== pet_id && rel.to_pet_id !== pet_id) {
      throw new AppError("AUTH_FORBIDDEN", "Not part of this request", 403);
    }

    // Delete from Supabase
    await supabase.from("pet_relationships").delete().eq("id", relationship_id);

    // Delete from Neo4j
    await neo4jQuery(
      `MATCH (a:Pet {id: $from})-[r:SENT_REQUEST_TO]->(b:Pet {id: $to}) DELETE r`,
      { from: rel.from_pet_id, to: rel.to_pet_id },
    );

    return ok({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
