/**
 * Webhook Edge Function: sync-place-update
 *
 * Triggered on UPDATE to places table.
 * Updates place properties on the Place node in Neo4j.
 *
 * POST /functions/v1/sync-place-update
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

    await neo4jQuery(
      `
      MERGE (pl:Place {id: $id})
      SET pl.name = $name,
          pl.type = $type,
          pl.avg_rating = $avg_rating,
          pl.is_active = $is_active
      `,
      {
        id: record.id,
        name: record.name,
        type: record.type,
        avg_rating: record.avg_rating ?? 0,
        is_active: record.is_active,
      },
    );

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("sync-place-update error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
