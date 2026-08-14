/**
 * Edge Function: neo4j-health
 *
 * Health check endpoint triggered by pg_cron job to verify Neo4j AuraDB connectivity.
 *
 * GET /functions/v1/neo4j-health
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
    const results = await neo4jQuery("RETURN 1 as ping");
    if (!results || results.length === 0) {
      throw new Error("No response from Neo4j ping");
    }

    return new Response(JSON.stringify({ neo4j: "healthy" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Neo4j health check failed:", error.message);
    return new Response(
      JSON.stringify({ neo4j: "unhealthy", error: error.message }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
