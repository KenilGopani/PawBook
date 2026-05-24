/**
 * Edge Function: discover-nearby
 *
 * Find pets near the caller's pet (same city), excluding friends/blocked/pending.
 * Uses Neo4j for relationships and city-matching, enriched with Supabase data.
 *
 * GET /functions/v1/discover-nearby
 * Query Params: pet_id (required), species (optional), limit (optional)
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { ok, errorResponse, AppError } from "../_shared/errors.ts";
import { assertPetOwner, getQueryParams } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const params = getQueryParams(req);

    const pet_id = params.pet_id;
    if (!pet_id) {
      throw new AppError("VALIDATION_ERROR", "pet_id query parameter is required", 400);
    }

    // 1. Verify caller owns pet_id
    await assertPetOwner(supabase, user.id, pet_id);

    const species = params.species || null;
    const limit = params.limit ? parseInt(params.limit, 10) : 30;

    // 2. Query Neo4j for pets in same city, excluding friends, blocks, and self
    const neo4jResult = await neo4jQuery(
      `
      MATCH (me:Pet {id: $pet_id})
      MATCH (other:Pet)
      WHERE other.city = me.city
        AND other.id <> $pet_id
        AND ($species IS NULL OR other.species = $species)
        AND NOT (me)-[:BLOCKED]-(other)
        AND NOT (me)-[:FRIENDS_WITH]-(other)
        AND NOT (me)-[:SENT_REQUEST_TO]->(other)
      WITH me, other,
           COUNT { (me)-[:FRIENDS_WITH]->()-[:FRIENDS_WITH]->(other) } as mutual_count,
           SIZE([t IN other.temperament WHERE t IN me.temperament]) as shared_traits,
           SIZE(me.temperament) as my_traits
      WITH me, other, mutual_count, shared_traits, my_traits,
           CASE WHEN my_traits > 0 THEN toFloat(shared_traits) / my_traits * 60 ELSE 0 END as trait_score,
           CASE WHEN me.size = other.size THEN 20 ELSE 0 END as size_score,
           CASE WHEN me.species = other.species THEN 10 ELSE 0 END as species_score,
           CASE WHEN me.is_vaccinated AND other.is_vaccinated THEN 10 ELSE 0 END as vacc_score
      WITH other, mutual_count, toInteger(trait_score + size_score + species_score + vacc_score) as compatibility_score
      ORDER BY mutual_count DESC, compatibility_score DESC
      RETURN other.id as pet_id, mutual_count, compatibility_score
      LIMIT $limit
      `,
      { pet_id, species, limit }
    );

    if (neo4jResult.length === 0) {
      return ok({ data: [] });
    }

    const petIds = neo4jResult.map((r) => r.pet_id);

    // 3. Enrich with Supabase pet details
    const { data: pets, error: petsError } = await supabase
      .from("pets")
      .select("id, name, breed, avatar_url, temperament, size, is_vaccinated, profiles!owner_id(display_name, city)")
      .in("id", petIds)
      .eq("is_active", true);

    if (petsError) throw petsError;

    // 4. Map back while preserving the sorted order from Neo4j
    const petsMap = new Map(pets?.map((p) => [p.id, p]));
    const result = neo4jResult
      .map((r) => {
        const pet = petsMap.get(r.pet_id);
        if (!pet) return null;
        return {
          pet_id: pet.id,
          name: pet.name,
          breed: pet.breed,
          avatar_url: pet.avatar_url,
          temperament: pet.temperament,
          size: pet.size,
          is_vaccinated: pet.is_vaccinated,
          mutual_friends: r.mutual_count,
          compatibility_score: r.compatibility_score,
          owner: {
            display_name: pet.profiles?.display_name,
            city: pet.profiles?.city,
          },
        };
      })
      .filter(Boolean);

    return ok({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
});
