/**
 * Edge Function: create-place
 *
 * Add a new pet-friendly place. Syncs to Neo4j.
 *
 * POST /functions/v1/create-place
 * Body: { name, type, lat, lng, address, tags }
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { created, errorResponse, AppError } from "../_shared/errors.ts";
import { ALLOWED_PLACE_TYPES, ALLOWED_PLACE_TAGS } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const body = await req.json();

    const { name, type, lat, lng, address, tags = [] } = body;

    // 1. Validation
    if (!name || typeof name !== "string" || name.length < 3 || name.length > 100) {
      throw new AppError("VALIDATION_ERROR", "name is required and must be 3–100 characters", 400);
    }

    if (!type || !ALLOWED_PLACE_TYPES.includes(type as any)) {
      throw new AppError("VALIDATION_ERROR", `type is required and must be one of: ${ALLOWED_PLACE_TYPES.join(", ")}`, 400);
    }

    if (lat === undefined || typeof lat !== "number" || lat < -90 || lat > 90) {
      throw new AppError("VALIDATION_ERROR", "lat must be a number between -90 and 90", 400);
    }

    if (lng === undefined || typeof lng !== "number" || lng < -180 || lng > 180) {
      throw new AppError("VALIDATION_ERROR", "lng must be a number between -180 and 180", 400);
    }

    if (address && (typeof address !== "string" || address.length > 200)) {
      throw new AppError("VALIDATION_ERROR", "address must be a string under 200 characters", 400);
    }

    if (tags.length > 0) {
      for (const t of tags) {
        if (!ALLOWED_PLACE_TAGS.includes(t as any)) {
          throw new AppError("INVALID_TAG", `Tag "${t}" is not allowed. Allowed: ${ALLOWED_PLACE_TAGS.join(", ")}`, 400);
        }
      }
    }

    // 2. Check for duplicate place within 100m with same name (prevent spam)
    const { data: nearby, error: nearbyError } = await supabase.rpc("places_nearby", {
      p_lat: lat,
      p_lng: lng,
      p_radius_m: 100.0,
      p_limit: 10,
    });

    if (nearbyError) throw nearbyError;

    const duplicate = nearby?.find(
      (n: any) => n.name.toLowerCase().trim() === name.toLowerCase().trim()
    );

    if (duplicate) {
      throw new AppError("DUPLICATE", "A similar place already exists nearby", 409);
    }

    // 3. Get creator's city to assign to place in Neo4j
    const { data: profile } = await supabase
      .from("profiles")
      .select("city")
      .eq("id", user.id)
      .single();

    const derivedCity = profile?.city || "unknown";

    // 4. Insert place into Supabase
    const { data: place, error: insertError } = await supabase
      .from("places")
      .insert({
        name,
        type,
        location: `POINT(${lng} ${lat})`,
        address: address || null,
        tags,
        added_by: user.id,
        is_verified: false,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 5. Create Place node in Neo4j
    await neo4jQuery(
      `
      MERGE (pl:Place {id: $id})
      SET pl.name = $name, pl.type = $type,
          pl.lat = $lat, pl.lng = $lng,
          pl.city = $city, pl.avg_rating = 0.0
      `,
      {
        id: place.id,
        name: place.name,
        type: place.type,
        lat,
        lng,
        city: derivedCity,
      }
    );

    return created({
      id: place.id,
      name: place.name,
      type: place.type,
      lat,
      lng,
      address: place.address,
      tags: place.tags,
      avg_rating: 0,
      review_count: 0,
      is_verified: place.is_verified,
      created_at: place.created_at,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
