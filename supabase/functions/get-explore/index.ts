/**
 * Edge Function: get-explore
 *
 * Explore feed — trending posts in user's city from the last 7 days, excluding friends/own pets.
 * Sorted by engagement score: (like_count * 2 + comment_count) DESC, then created_at DESC.
 *
 * GET /functions/v1/get-explore
 * Query Params: city (optional), species (optional), tag (optional), cursor (timestamptz, optional), limit (optional, max 50)
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { errorResponse, ok } from "../_shared/errors.ts";
import { getQueryParams } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const params = getQueryParams(req);

    const species = params.species || null;
    const tag = params.tag || null;
    const cursor = params.cursor || null;
    const limit = params.limit ? Math.min(parseInt(params.limit, 10), 50) : 30;

    // 1. Get caller profile to find their default city
    const { data: callerProfile, error: profileError } = await supabase
      .from("profiles")
      .select("city")
      .eq("id", user.id)
      .single();

    if (profileError) throw profileError;

    const city = params.city || callerProfile?.city;
    if (!city) {
      // If no city is specified or found, we cannot filter by city. Let's return empty or proceed without city filter.
      // The spec states "trending posts in user's city", so city is required.
      return ok({ data: [], next_cursor: null });
    }

    // 2. Get profile IDs in that city
    const { data: profilesInCity, error: cityProfilesError } = await supabase
      .from("profiles")
      .select("id")
      .eq("city", city)
      .eq("is_active", true);

    if (cityProfilesError) throw cityProfilesError;
    const profileIds = (profilesInCity || []).map((p) => p.id);

    if (profileIds.length === 0) {
      return ok({ data: [], next_cursor: null });
    }

    // 3. Get all active pets in that city (filter by species in DB if specified)
    let petsQuery = supabase
      .from("pets")
      .select("id")
      .in("owner_id", profileIds)
      .eq("is_active", true);

    if (species) {
      petsQuery = petsQuery.eq("species", species);
    }

    const { data: petsInCity, error: petsError } = await petsQuery;
    if (petsError) throw petsError;
    const cityPetIds = (petsInCity || []).map((p) => p.id);

    if (cityPetIds.length === 0) {
      return ok({ data: [], next_cursor: null });
    }

    // 4. Get caller's pets and their friends to exclude
    const { data: myPets, error: myPetsError } = await supabase
      .from("pets")
      .select("id")
      .eq("owner_id", user.id)
      .eq("is_active", true);

    if (myPetsError) throw myPetsError;
    const myPetIds = (myPets || []).map((p) => p.id);

    const friendPetIds = new Set<string>();
    if (myPetIds.length > 0) {
      const { data: friendRels, error: friendError } = await supabase
        .from("pet_relationships")
        .select("from_pet_id, to_pet_id")
        .eq("rel_type", "FRIEND")
        .or(`from_pet_id.in.(${myPetIds.join(",")}),to_pet_id.in.(${myPetIds.join(",")})`);

      if (friendError) throw friendError;

      friendRels?.forEach((r) => {
        if (myPetIds.includes(r.from_pet_id)) friendPetIds.add(r.to_pet_id);
        if (myPetIds.includes(r.to_pet_id)) friendPetIds.add(r.from_pet_id);
      });
    }

    const excludePetIds = [...myPetIds, ...friendPetIds];

    // 5. Exclude own/friend pets from city pets list
    const explorePetIds = cityPetIds.filter((id) => !excludePetIds.includes(id));

    if (explorePetIds.length === 0) {
      return ok({ data: [], next_cursor: null });
    }

    // 6. Query posts from the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let postsQuery = supabase
      .from("posts")
      .select(`
        id, caption, media_urls, media_type, tags,
        like_count, comment_count, created_at,
        pet:pets!pet_id (
          id, name, breed, avatar_url,
          owner:profiles!owner_id (id, display_name, avatar_url, city)
        ),
        place:places!place_id (id, name, type),
        meetup:meetups!meetup_id (id, title)
      `)
      .in("pet_id", explorePetIds)
      .eq("is_active", true)
      .gte("created_at", sevenDaysAgo.toISOString());

    if (tag) {
      postsQuery = postsQuery.contains("tags", [tag]);
    }

    if (cursor) {
      postsQuery = postsQuery.lt("created_at", cursor);
    }

    const { data: posts, error: postsQueryError } = await postsQuery;
    if (postsQueryError) throw postsQueryError;

    if (!posts || posts.length === 0) {
      return ok({ data: [], next_cursor: null });
    }

    // 7. Sort posts in TypeScript using the engagement formula:
    // score = (like_count * 2) + comment_count
    const sortedPosts = posts.map((post) => {
      const score = (post.like_count || 0) * 2 + (post.comment_count || 0);
      return { post, score };
    });

    sortedPosts.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return new Date(b.post.created_at).getTime() - new Date(a.post.created_at).getTime();
    });

    // 8. Apply limit
    const paginated = sortedPosts.slice(0, limit).map((x) => x.post);

    const nextCursor = paginated.length === limit
      ? paginated[paginated.length - 1].created_at
      : null;

    return ok({ data: paginated, next_cursor: nextCursor });
  } catch (error) {
    return errorResponse(error);
  }
});
