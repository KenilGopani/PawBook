/**
 * Edge Function: place-checkins
 *
 * Get recent pet check-ins at a place from Neo4j VISITED relationships, enriched with Supabase.
 *
 * GET /functions/v1/place-checkins
 * Query Params / Path: place_id (or in path), limit, since_days
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { AppError, errorResponse, ok } from "../_shared/errors.ts";
import { getQueryParams } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    // Ensure caller is logged in
    await getAuthUser(supabase);

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

    const limit = params.limit ? parseInt(params.limit, 10) : 20;
    const since_days = params.since_days ? parseInt(params.since_days, 10) : 30;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - since_days);
    const since_date = sinceDate.toISOString();

    // 1. Query Neo4j for VISITED relationships on this place
    const neo4jResult = await neo4jQuery(
      `
      MATCH (p:Pet)-[v:VISITED]->(pl:Place {id: $place_id})
      WHERE v.visited_at > $since_date
      RETURN p.id as pet_id, p.name as name, v.visited_at as visited_at, v.meetup_id as meetup_id
      ORDER BY v.visited_at DESC
      LIMIT $limit
      `,
      { place_id, since_date, limit },
    );

    if (neo4jResult.length === 0) {
      return ok({ data: [] });
    }

    const petIds = neo4jResult.map((r) => r.pet_id);

    // 2. Enrich with Supabase pet data (avatar, breed)
    const { data: pets, error: petsError } = await supabase
      .from("pets")
      .select("id, breed, avatar_url")
      .in("id", petIds)
      .eq("is_active", true);

    if (petsError) throw petsError;

    const petsMap = new Map(pets?.map((p) => [p.id, p]));

    // 3. Map back maintaining sort order
    const result = neo4jResult
      .map((r) => {
        const pet = petsMap.get(r.pet_id);
        if (!pet) return null;
        return {
          pet_id: r.pet_id,
          name: r.name,
          breed: pet.breed,
          avatar_url: pet.avatar_url,
          visited_at: r.visited_at,
          meetup_id: r.meetup_id,
        };
      })
      .filter(Boolean);

    return ok({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
});
