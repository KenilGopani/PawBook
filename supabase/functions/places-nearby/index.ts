/**
 * Edge Function: places-nearby
 *
 * Find pet-friendly places near a given lat/lng.
 * Uses PostGIS for geo matching, enriches with Neo4j social proof.
 *
 * GET /functions/v1/places-nearby
 * Query Params: lat (required), lng (required), radius_km (optional, default 10),
 *               type (optional), tags (optional, comma-separated), sort (optional, default distance), limit (optional)
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { AppError, errorResponse, ok } from "../_shared/errors.ts";
import { distanceLabel, getOwnerPetIds, getQueryParams } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const params = getQueryParams(req);

    const latRaw = params.lat;
    const lngRaw = params.lng;

    if (!latRaw || !lngRaw) {
      throw new AppError("VALIDATION_ERROR", "lat and lng are required query parameters", 400);
    }

    const lat = parseFloat(latRaw);
    const lng = parseFloat(lngRaw);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      throw new AppError("VALIDATION_ERROR", "lat must be a float between -90 and 90", 400);
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      throw new AppError("VALIDATION_ERROR", "lng must be a float between -180 and 180", 400);
    }

    const radius_km = params.radius_km ? Math.min(parseInt(params.radius_km, 10), 50) : 10;
    const type = params.type || null;
    const sort = params.sort || "distance";
    const limit = params.limit ? Math.min(parseInt(params.limit, 10), 50) : 20;

    let tagFilter: string[] = [];
    if (params.tags) {
      tagFilter = params.tags.split(",").map((t) => t.trim()).filter(Boolean);
    }

    // 1. Call PostGIS RPC places_nearby
    const { data: places, error: rpcError } = await supabase.rpc("places_nearby", {
      p_lat: lat,
      p_lng: lng,
      p_radius_m: radius_km * 1000,
      p_type: type,
      p_limit: limit,
    });

    if (rpcError) throw rpcError;

    if (!places || places.length === 0) {
      return ok({ data: [] });
    }

    // 2. Enrich with Neo4j social proof: count pet-friends who visited each place
    const placeIds = places.map((p: any) => p.id);
    const userPetIds = await getOwnerPetIds(supabase, user.id);

    const socialMap: Record<string, number> = {};

    if (userPetIds.length > 0) {
      const socialProof = await neo4jQuery(
        `
        MATCH (friend:Pet)-[:VISITED]->(place:Place)
        WHERE place.id IN $place_ids
          AND EXISTS {
            MATCH (me:Pet)-[:FRIENDS_WITH]->(friend)
            WHERE me.id IN $my_pet_ids
          }
        WITH place.id as place_id, COUNT(DISTINCT friend) as friend_visit_count
        RETURN place_id, friend_visit_count
        `,
        { place_ids: placeIds, my_pet_ids: userPetIds },
      );

      socialProof?.forEach((r: any) => {
        socialMap[r.place_id] = r.friend_visit_count;
      });
    }

    // 3. Format and enrich places
    let enriched = places.map((p: any) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      address: p.address,
      avg_rating: p.avg_rating ? parseFloat(p.avg_rating) : 0,
      review_count: p.review_count || 0,
      tags: p.tags || [],
      is_verified: p.is_verified || false,
      lat: p.lat,
      lng: p.lng,
      distance_m: p.distance_m,
      distance_label: distanceLabel(p.distance_m),
      friends_visited_count: socialMap[p.id] ?? 0,
    }));

    // 4. Tag filtering (if tags provided)
    if (tagFilter.length > 0) {
      enriched = enriched.filter((p: any) => tagFilter.every((t) => p.tags.includes(t)));
    }

    // 5. Sorting
    if (sort === "rating") {
      enriched.sort((a: any, b: any) => b.avg_rating - a.avg_rating);
    }

    return ok({ data: enriched });
  } catch (error) {
    return errorResponse(error);
  }
});
