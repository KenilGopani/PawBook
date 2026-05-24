/**
 * Webhook Edge Function: sync-relationship-delete
 *
 * Triggered on DELETE to pet_relationships table.
 * Deletes the corresponding edges in Neo4j.
 *
 * POST /functions/v1/sync-relationship-delete
 */

import { neo4jQuery, neo4jBatch } from "../_shared/neo4j.ts";

Deno.serve(async (req) => {
  // Verify authorization
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (authHeader !== `Bearer ${serviceRoleKey}` && authHeader !== serviceRoleKey) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    const { old_record } = payload;

    if (!old_record) {
      return new Response("Invalid payload", { status: 400 });
    }

    const { from_pet_id, to_pet_id, rel_type } = old_record;

    if (!from_pet_id || !to_pet_id || !rel_type) {
      return new Response("Missing fields in old_record", { status: 400 });
    }

    if (rel_type === "FRIEND") {
      await neo4jBatch([
        {
          statement: "MATCH (a:Pet {id: $a})-[r:FRIENDS_WITH]->(b:Pet {id: $b}) DELETE r",
          parameters: { a: from_pet_id, b: to_pet_id },
        },
        {
          statement: "MATCH (a:Pet {id: $a})-[r:FRIENDS_WITH]->(b:Pet {id: $b}) DELETE r",
          parameters: { a: to_pet_id, b: from_pet_id },
        },
      ]);
    } else if (rel_type === "FRIEND_REQ") {
      await neo4jQuery(
        "MATCH (a:Pet {id: $a})-[r:SENT_REQUEST_TO]->(b:Pet {id: $b}) DELETE r",
        { a: from_pet_id, b: to_pet_id }
      );
    } else if (rel_type === "BLOCKED") {
      await neo4jQuery(
        "MATCH (a:Pet {id: $a})-[r:BLOCKED]->(b:Pet {id: $b}) DELETE r",
        { a: from_pet_id, b: to_pet_id }
      );
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("sync-relationship-delete error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
