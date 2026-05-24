/**
 * Edge Function: nearby-pets
 *
 * Find active pets and owners near the caller's location.
 * Groups pets by owner, filters out own pets/blocked relationships, and converts distance to a label.
 *
 * GET /functions/v1/nearby-pets
 * Query Params: lat (required), lng (required), radius_km (optional, default 5), species (optional), limit (optional)
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { ok, errorResponse, AppError } from "../_shared/errors.ts";
import { getQueryParams, getOwnerPetIds, distanceLabel } from "../_shared/helpers.ts";

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

    const radius_km = params.radius_km ? Math.min(parseInt(params.radius_km, 10), 50) : 5;
    const species = params.species || null;
    const limit = params.limit ? Math.min(parseInt(params.limit, 10), 100) : 30;

    // 1. Get caller's own pet IDs to exclude
    const myPetIds = await getOwnerPetIds(supabase, user.id);

    // 2. Fetch blocked relationships to exclude
    const blockedPetIds = new Set<string>();
    if (myPetIds.length > 0) {
      const { data: blockedRels } = await supabase
        .from("pet_relationships")
        .select("from_pet_id, to_pet_id")
        .eq("rel_type", "BLOCKED")
        .or(`from_pet_id.in.(${myPetIds.join(",")}),to_pet_id.in.(${myPetIds.join(",")})`);

      blockedRels?.forEach((r) => {
        blockedPetIds.add(r.from_pet_id);
        blockedPetIds.add(r.to_pet_id);
      });
    }

    // 3. Call database RPC function
    const { data: rawRows, error: rpcError } = await supabase.rpc("nearby_pet_owners", {
      p_lat: lat,
      p_lng: lng,
      p_radius_m: radius_km * 1000,
      p_limit: limit,
    });

    if (rpcError) throw rpcError;

    // 4. Group results by owner and filter
    const grouped = new Map<string, any>();

    for (const row of rawRows || []) {
      // Exclude caller's own pets
      if (row.owner_id === user.id) continue;

      // Exclude blocked pets
      if (blockedPetIds.has(row.pet_id)) continue;

      // Optional species filtering
      if (species && row.pet_species !== species) continue;

      if (!grouped.has(row.owner_id)) {
        grouped.set(row.owner_id, {
          owner: {
            id: row.owner_id,
            display_name: row.display_name,
            avatar_url: row.avatar_url,
            city: row.city,
            distance_label: distanceLabel(row.distance_m),
          },
          pets: [],
        });
      }

      grouped.get(row.owner_id).pets.push({
        id: row.pet_id,
        name: row.pet_name,
        breed: row.pet_breed,
        avatar_url: row.pet_avatar_url,
        species: row.pet_species,
        temperament: row.pet_temperament,
        size: row.pet_size,
      });
    }

    return ok({ data: Array.from(grouped.values()) });
  } catch (error) {
    return errorResponse(error);
  }
});
