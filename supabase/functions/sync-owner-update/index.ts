/**
 * Webhook Edge Function: sync-owner-update
 *
 * Triggered on UPDATE to profiles table.
 * Updates Owner and owned Pets in Neo4j.
 *
 * POST /functions/v1/sync-owner-update
 */

import { neo4jQuery } from "../_shared/neo4j.ts";

Deno.serve(async (req) => {
  // Verify authorization
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (authHeader !== `Bearer ${serviceRoleKey}` && authHeader !== serviceRoleKey) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    const { record } = payload;

    if (!record || !record.id) {
      return new Response("Invalid payload", { status: 400 });
    }

    // Parse location if present
    let lat: number | null = null;
    let lng: number | null = null;

    if (record.location) {
      if (typeof record.location === "object" && Array.isArray(record.location.coordinates)) {
        lng = record.location.coordinates[0];
        lat = record.location.coordinates[1];
      } else if (typeof record.location === "string") {
        // Parse WKT e.g. "POINT(-122.4194 37.7749)"
        const match = record.location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
        if (match) {
          lng = parseFloat(match[1]);
          lat = parseFloat(match[2]);
        }
      }
    }

    await neo4jQuery(
      `
      MERGE (o:Owner {id: $owner_id})
      SET o.display_name = $display_name,
          o.city = $city,
          o.lat = CASE WHEN $lat IS NULL THEN o.lat ELSE $lat END,
          o.lng = CASE WHEN $lng IS NULL THEN o.lng ELSE $lng END
      WITH o
      MATCH (o)-[:OWNS]->(p:Pet)
      SET p.city = $city,
          p.lat = CASE WHEN $lat IS NULL THEN p.lat ELSE $lat END,
          p.lng = CASE WHEN $lng IS NULL THEN p.lng ELSE $lng END
      `,
      {
        owner_id: record.id,
        display_name: record.display_name ?? "",
        city: record.city ?? "",
        lat,
        lng,
      },
    );

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("sync-owner-update error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
