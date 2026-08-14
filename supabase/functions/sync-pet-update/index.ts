/**
 * Webhook Edge Function: sync-pet-update
 *
 * Triggered on UPDATE to pets table.
 * Updates pet properties on the Pet node in Neo4j.
 *
 * POST /functions/v1/sync-pet-update
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
      MATCH (p:Pet {id: $id})
      SET p.name = $name,
          p.species = $species,
          p.breed = $breed,
          p.temperament = $temperament,
          p.size = $size,
          p.is_vaccinated = $is_vaccinated,
          p.is_active = $is_active
      `,
      {
        id: record.id,
        name: record.name,
        species: record.species,
        breed: record.breed ?? "",
        temperament: record.temperament ?? [],
        size: record.size ?? "",
        is_vaccinated: record.is_vaccinated,
        is_active: record.is_active,
      },
    );

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("sync-pet-update error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
