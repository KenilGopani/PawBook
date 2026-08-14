/**
 * Edge Function: add-comment
 *
 * Add a comment or reply to a post.
 *
 * POST /functions/v1/add-comment
 * Query Params / Body: post_id (or path), pet_id, body, parent_id
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { AppError, errorResponse, NotFoundError, ok } from "../_shared/errors.ts";
import { assertPetOwner, createNotification, getQueryParams } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);

    const params = getQueryParams(req);
    const bodyJson = await req.json().catch(() => ({}));

    let post_id = params.post_id || params.id || bodyJson.post_id;
    const pet_id = bodyJson.pet_id;
    const commentBody = bodyJson.body;
    const parent_id = bodyJson.parent_id || null;

    // Fallback: parse from path (e.g., /add-comment/uuid)
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      post_id = post_id || pathParts[1];
    }

    if (!post_id || !pet_id || !commentBody) {
      throw new AppError("VALIDATION_ERROR", "post_id, pet_id, and body are required", 400);
    }

    if (commentBody.length < 1 || commentBody.length > 500) {
      throw new AppError("VALIDATION_ERROR", "body must be between 1 and 500 characters", 400);
    }

    // 1. Verify caller owns pet_id
    await assertPetOwner(supabase, user.id, pet_id);

    // 2. Fetch the post to verify existence and get owner_id
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, pet_id, pets!pet_id(owner_id)")
      .eq("id", post_id)
      .eq("is_active", true)
      .single();

    if (postError || !post) {
      throw new NotFoundError("Post not found");
    }

    // 3. Parent comment validation (if reply)
    let parentCommentOwnerId: string | null = null;
    if (parent_id) {
      const { data: parentComment, error: parentError } = await supabase
        .from("comments")
        .select("id, post_id, parent_id, author_pet_id, pets!author_pet_id(owner_id)")
        .eq("id", parent_id)
        .eq("is_active", true)
        .single();

      if (parentError || !parentComment) {
        throw new AppError("INVALID_PARENT", "Parent comment not found", 400);
      }
      if (parentComment.post_id !== post_id) {
        throw new AppError("INVALID_PARENT", "Parent comment belongs to a different post", 400);
      }
      if (parentComment.parent_id !== null) {
        throw new AppError("INVALID_PARENT", "Cannot reply to a nested comment", 400);
      }

      parentCommentOwnerId = parentComment.pets?.owner_id || null;
    }

    // 4. Insert comment into Supabase
    const { data: comment, error: insertError } = await supabase
      .from("comments")
      .insert({
        post_id,
        author_pet_id: pet_id,
        body: commentBody,
        parent_id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Fetch author pet name for notification
    const { data: authorPet } = await supabase
      .from("pets")
      .select("name")
      .eq("id", pet_id)
      .single();

    const authorName = authorPet?.name || "A pet";

    // 5. Notify post owner (if not own post)
    const postOwnerId = post.pets?.owner_id;
    if (postOwnerId && postOwnerId !== user.id) {
      await createNotification(supabase, {
        recipient_id: postOwnerId,
        type: "POST_COMMENT",
        payload: {
          post_id,
          comment_id: comment.id,
          author_pet_id: pet_id,
          author_pet_name: authorName,
          body_preview: commentBody.slice(0, 50),
        },
      });
    }

    // 6. Notify parent comment author (if reply and not replying to own comment)
    if (parent_id && parentCommentOwnerId && parentCommentOwnerId !== user.id) {
      await createNotification(supabase, {
        recipient_id: parentCommentOwnerId,
        type: "COMMENT_REPLY",
        payload: {
          post_id,
          comment_id: comment.id,
          parent_id,
          author_pet_id: pet_id,
          author_pet_name: authorName,
          body_preview: commentBody.slice(0, 50),
        },
      });
    }

    return ok(comment);
  } catch (error) {
    return errorResponse(error);
  }
});
