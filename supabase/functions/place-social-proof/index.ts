/**
 * Edge Function: place-social-proof
 *
 * Find which of the caller's friends have visited a place.
 * Queries Neo4j for VISITED relationships on the place by friends of the caller's pets.
 *
 * GET /functions/v1/place-social-proof
 * Query Params / Path: place_id (or in path)
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { AppError, errorResponse, ok } from "../_shared/errors.ts";
import { getOwnerPetIds, getQueryParams } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);

    const params = getQueryParams(req);
    let place_id = params.place_id || params.id;

    // Fallback: parse path param
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      place_id = place_id || pathParts[1];
    }

    if (!place_id) {
      throw new AppError("VALIDATION_ERROR", "place_id is required", 400);
    }

    // 1. Get caller's pet IDs
    const myPetIds = await getOwnerPetIds(supabase, user.id);

    if (myPetIds.length === 0) {
      return ok({
        friends_visited_count: 0,
        friends_preview: [],
      });
    }

    // 2. Query Neo4j for social proof
    const neo4jResult = await neo4jQuery(
      `
      MATCH (me:Pet)-[:FRIENDS_WITH]->(friend:Pet)-[v:VISITED]->(pl:Place {id: $place_id})
      WHERE me.id IN $my_pet_ids
      WITH friend, MAX(v.visited_at) as last_visit
      ORDER BY last_visit DESC
      WITH COLLECT({pet_id: friend.id, name: friend.name, last_visit: last_visit}) as all_visits
      RETURN SIZE(all_visits) as total_count, all_visits[0..10] as preview
      `,
      { place_id, my_pet_ids: myPetIds },
    );

    const totalCount = neo4jResult[0]?.total_count ?? 0;
    const previewRaw = neo4jResult[0]?.preview ?? [];

    if (totalCount === 0 || previewRaw.length === 0) {
      return ok({
        friends_visited_count: 0,
        friends_preview: [],
      });
    }

    const previewPetIds = previewRaw.map((p: any) => p.pet_id);

    // 3. Enrich preview with Supabase pet avatars
    const { data: pets, error: petsError } = await supabase
      .from("pets")
      .select("id, avatar_url")
      .in("id", previewPetIds)
      .eq("is_active", true);

    if (petsError) throw petsError;

    const petsMap = new Map(pets?.map((p) => [p.id, p]));

    const friendsPreview = previewRaw
      .map((p: any) => {
        const pet = petsMap.get(p.pet_id);
        if (!pet) return null;
        return {
          pet_id: p.pet_id,
          name: p.name,
          avatar_url: pet.avatar_url,
          last_visit: p.last_visit,
        };
      })
      .filter(Boolean);

    return ok({
      friends_visited_count: totalCount,
      friends_preview: friendsPreview,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
