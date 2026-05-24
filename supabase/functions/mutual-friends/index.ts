/**
 * Edge Function: mutual-friends
 *
 * Find mutual friends between two pets.
 * Queries Neo4j for pets connected to both targets, enriched with Supabase.
 *
 * GET /functions/v1/mutual-friends
 * Query Params / Path: pet_id (or first path param), other_pet_id (or second path param)
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { ok, errorResponse, AppError } from "../_shared/errors.ts";
import { getQueryParams } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    // Ensure caller is logged in
    await getAuthUser(supabase);

    const params = getQueryParams(req);
    let pet_a = params.pet_id || params.pet_a_id || params.id;
    let pet_b = params.other_pet_id || params.other_id;

    // Parse path parameters as fallback (e.g. /mutual-friends/pet-a-id/pet-b-id)
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // If the path contains the ids, extract them
    if (pathParts.length >= 3) {
      pet_a = pet_a || pathParts[1];
      pet_b = pet_b || pathParts[2];
    }

    if (!pet_a || !pet_b) {
      throw new AppError("VALIDATION_ERROR", "Two pet IDs are required (pet_id and other_pet_id)", 400);
    }

    // Query Neo4j for mutual friends
    const neo4jResult = await neo4jQuery(
      `
      MATCH (a:Pet {id: $pet_a})-[:FRIENDS_WITH]->(mutual:Pet)<-[:FRIENDS_WITH]-(b:Pet {id: $pet_b})
      RETURN mutual.id as pet_id
      `,
      { pet_a, pet_b }
    );

    if (neo4jResult.length === 0) {
      return ok({ count: 0, data: [] });
    }

    const petIds = neo4jResult.map((r) => r.pet_id);

    // Enrich with Supabase details
    const { data: pets, error: petsError } = await supabase
      .from("pets")
      .select("id, name, breed, avatar_url")
      .in("id", petIds)
      .eq("is_active", true);

    if (petsError) throw petsError;

    const result = (pets || []).map((p) => ({
      pet_id: p.id,
      name: p.name,
      breed: p.breed,
      avatar_url: p.avatar_url,
    }));

    return ok({
      count: result.length,
      data: result,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
