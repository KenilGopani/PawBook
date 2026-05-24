/**
 * Edge Function: get-feed
 *
 * Assemble home feed for the authenticated user:
 * Posts from friends' pets + followed owners' pets, excluding own pets.
 * Sorted by created_at DESC, cursor-based pagination.
 *
 * GET /functions/v1/get-feed
 * Query Params: cursor (timestamptz, optional), limit (optional, max 50)
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { ok, errorResponse, AppError } from "../_shared/errors.ts";
import { getQueryParams } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const params = getQueryParams(req);

    const cursor = params.cursor || null;
    const limit = params.limit ? Math.min(parseInt(params.limit, 10), 50) : 20;

    // 1. Get all pet IDs owned by user
    const { data: myPets, error: myPetsError } = await supabase
      .from("pets")
      .select("id")
      .eq("owner_id", user.id)
      .eq("is_active", true);

    if (myPetsError) throw myPetsError;
    const myPetIds = (myPets || []).map((p) => p.id);

    if (myPetIds.length === 0) {
      // User has no pets, return empty feed
      return ok({ data: [], next_cursor: null });
    }

    // 2. Get friend pet IDs from pet_relationships (bidirectional search in single-row table)
    const { data: friendRels, error: friendError } = await supabase
      .from("pet_relationships")
      .select("from_pet_id, to_pet_id")
      .eq("rel_type", "FRIEND")
      .or(`from_pet_id.in.(${myPetIds.join(",")}),to_pet_id.in.(${myPetIds.join(",")})`);

    if (friendError) throw friendError;

    const friendPetIds = new Set<string>();
    friendRels?.forEach((r) => {
      if (myPetIds.includes(r.from_pet_id)) friendPetIds.add(r.to_pet_id);
      if (myPetIds.includes(r.to_pet_id)) friendPetIds.add(r.from_pet_id);
    });

    // 3. Get following owner IDs
    const { data: followRels, error: followError } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id);

    if (followError) throw followError;
    const followingOwnerIds = (followRels || []).map((r) => r.following_id);

    // 4. Get pet IDs of followed owners
    let followedPetIds: string[] = [];
    if (followingOwnerIds.length > 0) {
      const { data: followedPets, error: followedPetsError } = await supabase
        .from("pets")
        .select("id")
        .in("owner_id", followingOwnerIds)
        .eq("is_active", true);

      if (followedPetsError) throw followedPetsError;
      followedPetIds = (followedPets || []).map((p) => p.id);
    }

    // 5. Merge all source pet IDs (excluding own pets)
    const feedPetIds = [...new Set([...friendPetIds, ...followedPetIds])]
      .filter((id) => !myPetIds.includes(id));

    if (feedPetIds.length === 0) {
      return ok({ data: [], next_cursor: null });
    }

    // 6. Query posts
    let query = supabase
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
      .in("pet_id", feedPetIds)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data: posts, error: postsError } = await query;
    if (postsError) throw postsError;

    if (!posts || posts.length === 0) {
      return ok({ data: [], next_cursor: null });
    }

    // 7. For each post, check if caller's pets have reacted
    const postIds = posts.map((p) => p.id);
    const { data: myReactions, error: reactionsError } = await supabase
      .from("post_reactions")
      .select("post_id, reaction_type, pet_id")
      .in("post_id", postIds)
      .in("pet_id", myPetIds);

    if (reactionsError) throw reactionsError;

    // Merge reactions into posts
    const enrichedPosts = posts.map((post) => ({
      ...post,
      my_reaction: myReactions?.find((r) => r.post_id === post.id) ?? null,
    }));

    const nextCursor = posts.length === limit
      ? posts[posts.length - 1].created_at
      : null;

    return ok({ data: enrichedPosts, next_cursor: nextCursor });
  } catch (error) {
    return errorResponse(error);
  }
});
