/**
 * Edge Function: create-post
 *
 * Create a post after media has been uploaded to storage.
 * Validates ownership, checks media URLs against hotlinking, and logs Neo4j activity.
 *
 * POST /functions/v1/create-post
 * Body: { pet_id, caption, media_urls, media_type, tags, place_id, meetup_id }
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { created, errorResponse, AppError } from "../_shared/errors.ts";
import { assertPetOwner } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const body = await req.json();

    const { pet_id, caption, media_urls = [], media_type, tags = [], place_id, meetup_id } = body;

    // 1. Validation
    if (!pet_id) {
      throw new AppError("VALIDATION_ERROR", "pet_id is required", 400);
    }

    // Verify caller owns pet_id
    await assertPetOwner(supabase, user.id, pet_id);

    if (caption && caption.length > 500) {
      throw new AppError("VALIDATION_ERROR", "caption must be under 500 characters", 400);
    }

    if (media_urls.length > 0) {
      if (!media_type || (media_type !== "photo" && media_type !== "video")) {
        throw new AppError("VALIDATION_ERROR", "media_type is required when media_urls is present and must be 'photo' or 'video'", 400);
      }
      if (media_urls.length > 10) {
        throw new AppError("VALIDATION_ERROR", "media_urls exceeds maximum limit of 10 items", 400);
      }

      // Check for hotlinking / valid Supabase storage urls
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      for (const url of media_urls) {
        if (!url.startsWith(supabaseUrl) || !url.includes("/storage/v1/object/public/post-media/")) {
          throw new AppError("INVALID_MEDIA_URL", "Media URL must be a valid Supabase Storage URL in post-media bucket", 400);
        }
      }
    }

    if (tags.length > 0) {
      if (tags.length > 20) {
        throw new AppError("VALIDATION_ERROR", "Cannot have more than 20 tags", 400);
      }
      for (const t of tags) {
        if (typeof t !== "string" || t.length > 30) {
          throw new AppError("VALIDATION_ERROR", "Each tag must be a string, max 30 characters", 400);
        }
      }
    }

    if (place_id) {
      const { data: place } = await supabase
        .from("places")
        .select("id")
        .eq("id", place_id)
        .single();
      if (!place) throw new AppError("NOT_FOUND", "Specified place not found", 404);
    }

    // 2. Insert into Supabase
    const { data: post, error: insertError } = await supabase
      .from("posts")
      .insert({
        pet_id,
        caption: caption || null,
        media_urls,
        media_type: media_type || null,
        tags,
        place_id: place_id || null,
        meetup_id: meetup_id || null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 3. If place_id: update place's Neo4j node with recent activity
    if (place_id) {
      await neo4jQuery(
        `
        MATCH (p:Pet {id: $pet_id}), (pl:Place {id: $place_id})
        MERGE (p)-[v:VISITED {visited_at: $visited_at}]->(pl)
        SET v.meetup_id = $meetup_id
        `,
        {
          pet_id,
          place_id,
          visited_at: post.created_at,
          meetup_id: meetup_id || null,
        }
      );
    }

    return created(post);
  } catch (error) {
    return errorResponse(error);
  }
});
