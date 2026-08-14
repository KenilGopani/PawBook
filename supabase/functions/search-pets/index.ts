/**
 * Edge Function: search-pets
 *
 * Search pets by name, breed, or temperament with pagination.
 * Uses PostgreSQL pg_trgm index for fuzzy name/breed matching.
 *
 * GET /functions/v1/search-pets?q=golden&species=dog&city=San+Francisco&limit=20&page=1
 *
 * Query Parameters:
 *   q           — search term (fuzzy match on name/breed)
 *   species     — filter by species
 *   breed       — exact breed filter
 *   temperament — filter by temperament tags (comma-separated)
 *   city        — filter by owner's city
 *   page        — page number (default 1)
 *   limit       — results per page (default 20, max 50)
 *
 * See: 04_service_user_pet.md — GET /search/pets
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { errorResponse, ok } from "../_shared/errors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    await getAuthUser(supabase); // Ensure authenticated

    const url = new URL(req.url);
    const q = url.searchParams.get("q") || "";
    const species = url.searchParams.get("species");
    const breed = url.searchParams.get("breed");
    const temperamentParam = url.searchParams.get("temperament");
    const city = url.searchParams.get("city");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));

    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from("pets")
      .select(
        `id, name, species, breed, avatar_url, temperament, size, is_vaccinated,
         profiles!owner_id(city)`,
        { count: "exact" },
      )
      .eq("is_active", true);

    // Fuzzy search on name (using ilike as a cross-compatible approach)
    if (q) {
      query = query.or(`name.ilike.%${q}%,breed.ilike.%${q}%`);
    }

    // Exact filters
    if (species) {
      query = query.eq("species", species);
    }

    if (breed) {
      query = query.ilike("breed", `%${breed}%`);
    }

    // Temperament filter — pets must contain ALL specified temperaments
    if (temperamentParam) {
      const temperaments = temperamentParam.split(",").map((t) => t.trim());
      query = query.contains("temperament", temperaments);
    }

    // City filter (via the joined profiles table)
    // Note: Supabase SDK doesn't support filtering on joined tables directly in all cases.
    // We'll filter city in post-processing if needed.

    // Pagination
    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) throw error;

    // Post-process: flatten profiles.city into a top-level field
    // and filter by city if specified
    let results = (data || []).map((pet: Record<string, unknown>) => {
      const profiles = pet.profiles as { city: string } | null;
      return {
        id: pet.id,
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        avatar_url: pet.avatar_url,
        temperament: pet.temperament,
        size: pet.size,
        is_vaccinated: pet.is_vaccinated,
        city: profiles?.city || null,
      };
    });

    // Filter by city if specified (post-processing since Supabase join filter is limited)
    if (city) {
      results = results.filter(
        (r: { city: string | null }) => r.city?.toLowerCase() === city.toLowerCase(),
      );
    }

    return ok({
      data: results,
      pagination: {
        page,
        limit,
        total: count || 0,
        has_more: offset + limit < (count || 0),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
