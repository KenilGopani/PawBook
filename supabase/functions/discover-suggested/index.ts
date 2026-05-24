/**
 * Edge Function: discover-suggested
 *
 * Suggest friends of friends (2-hop traversal) for a pet.
 * Pure Neo4j graph query for mutual friends, enriched with Supabase details.
 *
 * GET /functions/v1/discover-suggested
 * Query Params: pet_id (required), limit (optional)
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

    // 1. Verify ownership
    await assertPetOwner(supabase, user.id, pet_id);

    const limit = params.limit ? parseInt(params.limit, 10) : 20;

    // 2. Query Neo4j for 2-hop suggestions
    const neo4jResult = await neo4jQuery(
      `
      MATCH (me:Pet {id: $pet_id})-[:FRIENDS_WITH]->(friend:Pet)-[:FRIENDS_WITH]->(suggestion:Pet)
      WHERE suggestion.id <> $pet_id
        AND NOT (me)-[:FRIENDS_WITH]->(suggestion)
        AND NOT (me)-[:BLOCKED]-(suggestion)
        AND NOT (me)-[:SENT_REQUEST_TO]->(suggestion)
        AND suggestion.species = me.species
      WITH me, suggestion, COUNT(DISTINCT friend) as mutual_count, COLLECT(DISTINCT friend.name)[0..2] as mutual_names
      WITH me, suggestion, mutual_count, mutual_names,
           SIZE([t IN suggestion.temperament WHERE t IN me.temperament]) as shared_traits,
           SIZE(me.temperament) as my_traits
      WITH suggestion, mutual_count, mutual_names, shared_traits, my_traits,
           CASE WHEN my_traits > 0 THEN toFloat(shared_traits) / my_traits * 60 ELSE 0 END as trait_score,
           CASE WHEN me.size = suggestion.size THEN 20 ELSE 0 END as size_score,
           CASE WHEN me.species = suggestion.species THEN 10 ELSE 0 END as species_score,
           CASE WHEN me.is_vaccinated AND suggestion.is_vaccinated THEN 10 ELSE 0 END as vacc_score
      WITH suggestion, mutual_count, mutual_names, toInteger(trait_score + size_score + species_score + vacc_score) as compatibility_score
      ORDER BY mutual_count DESC, compatibility_score DESC
      RETURN suggestion.id as pet_id, mutual_count, mutual_names, compatibility_score
      LIMIT $limit
      `,
      { pet_id, limit }
    );

    if (neo4jResult.length === 0) {
      return ok({ data: [] });
    }

    const petIds = neo4jResult.map((r) => r.pet_id);

    // 3. Enrich with Supabase details
    const { data: pets, error: petsError } = await supabase
      .from("pets")
      .select("id, name, breed, avatar_url, temperament, size, is_vaccinated, profiles!owner_id(display_name, city)")
      .in("id", petIds)
      .eq("is_active", true);

    if (petsError) throw petsError;

    // 4. Map back maintaining sort order
    const petsMap = new Map(pets?.map((p) => [p.id, p]));
    const result = neo4jResult
      .map((r) => {
        const pet = petsMap.get(r.pet_id);
        if (!pet) return null;
        return {
          pet_id: pet.id,
          mutual_friends_count: r.mutual_count,
          mutual_friends_preview: r.mutual_names || [],
          compatibility_score: r.compatibility_score,
          pet: {
            name: pet.name,
            breed: pet.breed,
            avatar_url: pet.avatar_url,
            temperament: pet.temperament,
            size: pet.size,
            is_vaccinated: pet.is_vaccinated,
            owner: {
              display_name: pet.profiles?.display_name,
              city: pet.profiles?.city,
            },
          },
        };
      })
      .filter(Boolean);

    return ok({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
});
