/**
 * Edge Function: unblock-pet
 *
 * Unblock a pet.
 *
 * POST /functions/v1/unblock-pet
 * Body: { from_pet_id, to_pet_id }
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { ok, errorResponse, AppError } from "../_shared/errors.ts";
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

    // 2. Delete BLOCKED from Supabase
    const { error: deleteError } = await supabase
      .from("pet_relationships")
      .delete()
      .eq("from_pet_id", from_pet_id)
      .eq("to_pet_id", to_pet_id)
      .eq("rel_type", "BLOCKED");

    if (deleteError) throw deleteError;

    // 3. Delete BLOCKED from Neo4j
    await neo4jQuery(
      `
      MATCH (a:Pet {id: $from_pet_id})-[r:BLOCKED]->(b:Pet {id: $to_pet_id})
      DELETE r
      `,
      { from_pet_id, to_pet_id }
    );

    return ok({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
