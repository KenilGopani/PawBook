/**
 * Edge Function: discover-compatible
 *
 * Find compatible pets for the caller's pet.
 * Calculates score in Neo4j, generates match reasons, and enriches with Supabase.
 *
 * GET /functions/v1/discover-compatible
 * Query Params: pet_id (required), min_score (optional), limit (optional)
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { AppError, errorResponse, ok } from "../_shared/errors.ts";
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

    const min_score = params.min_score ? parseInt(params.min_score, 10) : 50;
    const limit = params.limit ? parseInt(params.limit, 10) : 20;

    // 2. Fetch caller pet details for match reasons calculation
    const { data: callerPet, error: callerError } = await supabase
      .from("pets")
      .select("size, is_vaccinated, temperament")
      .eq("id", pet_id)
      .single();

    if (callerError || !callerPet) {
      throw new AppError("NOT_FOUND", "Caller pet not found", 404);
    }

    // 3. Neo4j Query to get compatible pet IDs and compatibility scores
    const neo4jResult = await neo4jQuery(
      `
      MATCH (me:Pet {id: $pet_id})
      MATCH (other:Pet)
      WHERE other.species = me.species
        AND other.city = me.city
        AND other.id <> $pet_id
        AND NOT (me)-[:BLOCKED]-(other)
        AND NOT (me)-[:FRIENDS_WITH]-(other)
      WITH me, other,
           SIZE([t IN other.temperament WHERE t IN me.temperament]) as shared_traits,
           SIZE(me.temperament) as my_trait_count
      WITH me, other, shared_traits, my_trait_count,
           CASE WHEN my_trait_count > 0
                THEN toFloat(shared_traits) / my_trait_count * 60
                ELSE 0 END as trait_score,
           CASE WHEN me.size = other.size THEN 20 ELSE 0 END as size_score,
           CASE WHEN me.is_vaccinated AND other.is_vaccinated THEN 10 ELSE 0 END as vacc_score
      WITH other,
           toInteger(trait_score + size_score + vacc_score + 10) as compat_score
      WHERE compat_score >= $min_score
      ORDER BY compat_score DESC
      RETURN other.id as pet_id, compat_score
      LIMIT $limit
      `,
      { pet_id, min_score, limit },
    );

    if (neo4jResult.length === 0) {
      return ok({ data: [] });
    }

    const petIds = neo4jResult.map((r) => r.pet_id);

    // 4. Enrich with Supabase details
    const { data: pets, error: petsError } = await supabase
      .from("pets")
      .select(
        "id, name, breed, avatar_url, temperament, size, is_vaccinated, profiles!owner_id(display_name, city)",
      )
      .in("id", petIds)
      .eq("is_active", true);

    if (petsError) throw petsError;

    // 5. Map back and compute match reasons
    const petsMap = new Map(pets?.map((p) => [p.id, p]));
    const result = neo4jResult
      .map((r) => {
        const pet = petsMap.get(r.pet_id);
        if (!pet) return null;

        const reasons: string[] = [];
        if (callerPet.size === pet.size) {
          reasons.push("Same size");
        }
        if (callerPet.is_vaccinated && pet.is_vaccinated) {
          reasons.push("Both vaccinated");
        }
        const shared = (callerPet.temperament || []).filter((t: string) =>
          (pet.temperament || []).includes(t)
        );
        if (shared.length > 0) {
          reasons.push(`Shared temperament: ${shared.join(", ")}`);
        }

        return {
          pet_id: pet.id,
          compatibility_score: r.compat_score,
          match_reasons: reasons,
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
