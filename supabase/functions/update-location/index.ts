/**
 * Edge Function: update-location
 *
 * Updates the authenticated user's location in both Supabase (profiles table)
 * and Neo4j (Owner node). Also updates location on all the user's Pet nodes.
 *
 * POST /functions/v1/update-location
 * Body: { lat: number, lng: number, city: string }
 *
 * See: 04_service_user_pet.md — POST /profile/location
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { errorResponse, ok } from "../_shared/errors.ts";
import { validateLocation } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const body = await req.json();

    // Validate input
    const { lat, lng, city } = validateLocation(body);

    // 1. Update Supabase profiles table
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        location: `POINT(${lng} ${lat})`,
        city,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) throw updateError;

    // 2. Sync to Neo4j — update Owner node
    await neo4jQuery(
      `
      MERGE (o:Owner {id: $owner_id})
      SET o.lat = $lat, o.lng = $lng, o.city = $city
      `,
      { owner_id: user.id, lat, lng, city },
    );

    // 3. Also update city on all Pet nodes owned by this user
    await neo4jQuery(
      `
      MATCH (o:Owner {id: $owner_id})-[:OWNS]->(p:Pet)
      SET p.city = $city, p.lat = $lat, p.lng = $lng
      `,
      { owner_id: user.id, city, lat, lng },
    );

    return ok({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
