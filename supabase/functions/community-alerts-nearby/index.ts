/**
 * Edge Function: community-alerts-nearby
 *
 * Find active community alerts near a given coordinate.
 *
 * GET /functions/v1/community-alerts-nearby
 * Query Params: lat (required), lng (required), radius_km (optional, default 5)
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { ok, errorResponse, AppError } from "../_shared/errors.ts";
import { getQueryParams, distanceLabel } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    // Ensure user is logged in
    await getAuthUser(supabase);

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

    const radius_km = params.radius_km ? Math.min(parseInt(params.radius_km, 10), 50) : 5;

    // Call RPC function community_alerts_nearby
    const { data: alerts, error: rpcError } = await supabase.rpc("community_alerts_nearby", {
      p_lat: lat,
      p_lng: lng,
      p_radius_m: radius_km * 1000,
    });

    if (rpcError) throw rpcError;

    const result = (alerts || []).map((a: any) => ({
      id: a.id,
      alert_type: a.alert_type,
      description: a.description,
      radius_km: parseFloat(a.radius_km),
      expires_at: a.expires_at,
      lat: a.lat,
      lng: a.lng,
      distance_m: a.distance_m,
      distance_label: distanceLabel(a.distance_m),
      reporter_display_name: a.reporter_display_name,
      created_at: a.created_at,
    }));

    return ok({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
});
