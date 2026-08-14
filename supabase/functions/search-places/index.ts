/**
 * Edge Function: search-places
 *
 * Text search for places using pg_trgm fuzzy matching with optional location-based biasing.
 *
 * GET /functions/v1/search-places
 * Query Params: q (required), lat (optional), lng (optional), type (optional), limit (optional)
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { AppError, errorResponse, ok } from "../_shared/errors.ts";
import { distanceLabel, getQueryParams } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    // Ensure user is logged in
    await getAuthUser(supabase);

    const params = getQueryParams(req);
    const queryStr = params.q;
    const latRaw = params.lat;
    const lngRaw = params.lng;
    const type = params.type || null;
    const limit = params.limit ? Math.min(parseInt(params.limit, 10), 50) : 20;

    if (!queryStr || queryStr.trim().length < 1) {
      throw new AppError("VALIDATION_ERROR", "q (search query) is a required query parameter", 400);
    }

    const lat = latRaw ? parseFloat(latRaw) : null;
    const lng = lngRaw ? parseFloat(lngRaw) : null;

    if (lat !== null && (isNaN(lat) || lat < -90 || lat > 90)) {
      throw new AppError("VALIDATION_ERROR", "lat must be a number between -90 and 90", 400);
    }
    if (lng !== null && (isNaN(lng) || lng < -180 || lng > 180)) {
      throw new AppError("VALIDATION_ERROR", "lng must be a number between -180 and 180", 400);
    }

    // Call Supabase search_places RPC
    const { data: places, error: searchError } = await supabase.rpc("search_places", {
      p_query: queryStr,
      p_lat: lat,
      p_lng: lng,
      p_type: type,
      p_limit: limit,
    });

    if (searchError) throw searchError;

    const result = (places || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      address: p.address,
      avg_rating: p.avg_rating ? parseFloat(p.avg_rating) : 0,
      tags: p.tags || [],
      is_verified: p.is_verified || false,
      lat: p.lat,
      lng: p.lng,
      distance_m: p.distance_m,
      distance_label: p.distance_m !== null ? distanceLabel(p.distance_m) : null,
      similarity: p.similarity,
    }));

    return ok({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
});
