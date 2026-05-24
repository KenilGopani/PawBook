/**
 * Webhook Edge Function: sync-owner-create
 *
 * Triggered on INSERT to profiles table.
 * Creates an Owner node in Neo4j.
 *
 * POST /functions/v1/sync-owner-create
 */

import { neo4jQuery } from "../_shared/neo4j.ts";

Deno.serve(async (req) => {
  // Verify authorization (must be service_role)
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
      MERGE (o:Owner {id: $id})
      SET o.display_name = $display_name,
          o.city = $city
      `,
      {
        id: record.id,
        display_name: record.display_name ?? "",
        city: record.city ?? "",
      }
    );

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("sync-owner-create error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
