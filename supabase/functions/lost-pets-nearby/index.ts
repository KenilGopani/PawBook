/**
 * Edge Function: lost-pets-nearby
 *
 * Find active lost pet alerts near a given coordinate.
 *
 * GET /functions/v1/lost-pets-nearby
 * Query Params: lat (required), lng (required), radius_km (optional, default 5), limit (optional)
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { AppError, errorResponse, ok } from "../_shared/errors.ts";
import { distanceLabel, getQueryParams } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    // Ensure caller is logged in
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
    const limit = params.limit ? Math.min(parseInt(params.limit, 10), 50) : 20;

    // 1. Fetch lost pet alerts near location
    const { data: alerts, error: rpcError } = await supabase.rpc("lost_pets_nearby", {
      p_lat: lat,
      p_lng: lng,
      p_radius_m: radius_km * 1000,
      p_limit: limit,
    });

    if (rpcError) throw rpcError;

    if (!alerts || alerts.length === 0) {
      return ok({ data: [] });
    }

    const petIds = alerts.map((a: any) => a.pet_id);

    // 2. Query detailed pet data from Supabase
    const { data: pets, error: petsError } = await supabase
      .from("pets")
      .select("id, name, breed, avatar_url, temperament, size")
      .in("id", petIds)
      .eq("is_active", true);

    if (petsError) throw petsError;

    const petsMap = new Map(pets?.map((p) => [p.id, p]));

    // 3. Map and enrich the alerts
    const result = alerts
      .map((a: any) => {
        const pet = petsMap.get(a.pet_id);
        if (!pet) return null;
        return {
          id: a.id,
          pet_id: a.pet_id,
          pet: {
            name: pet.name,
            breed: pet.breed,
            avatar_url: pet.avatar_url,
            temperament: pet.temperament,
            size: pet.size,
          },
          description: a.description,
          contact_info: a.contact_info,
          photo_url: a.photo_url,
          last_seen_at: a.last_seen_at,
          last_seen_lat: a.last_seen_lat,
          last_seen_lng: a.last_seen_lng,
          distance_m: a.distance_m,
          distance_label: distanceLabel(a.distance_m),
          status: a.status,
        };
      })
      .filter(Boolean);

    return ok({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
});
