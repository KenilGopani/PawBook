/**
 * Edge Function: react-to-post
 *
 * Add or change a reaction on a post. One reaction per pet per post.
 *
 * POST /functions/v1/react-to-post
 * Query Params / Body: post_id (or in path), pet_id, reaction_type
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { ok, errorResponse, AppError, NotFoundError } from "../_shared/errors.ts";
import { assertPetOwner, createNotification } from "../_shared/helpers.ts";
import { ALLOWED_REACTION_TYPES } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);

    const params = getQueryParams(req);
    const body = await req.json().catch(() => ({}));

    let post_id = params.post_id || params.id || body.post_id;
    const pet_id = body.pet_id;
    const reaction_type = body.reaction_type;

    // Fallback: parse from path (e.g., /react-to-post/uuid)
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      post_id = post_id || pathParts[1];
    }

    if (!post_id || !pet_id || !reaction_type) {
      throw new AppError("VALIDATION_ERROR", "post_id, pet_id, and reaction_type are required", 400);
    }

    // 1. Verify reaction type is allowed
    if (!ALLOWED_REACTION_TYPES.includes(reaction_type as any)) {
      throw new AppError("VALIDATION_ERROR", `reaction_type must be one of: ${ALLOWED_REACTION_TYPES.join(", ")}`, 400);
    }

    // 2. Verify caller owns pet_id
    await assertPetOwner(supabase, user.id, pet_id);

    // 3. Fetch the post & its owner to verify existence and prepare notification
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, pet_id, pets!pet_id(owner_id, name)")
      .eq("id", post_id)
      .eq("is_active", true)
      .single();

    if (postError || !post) {
      throw new NotFoundError("Post not found");
    }

    // 4. Upsert reaction
    const { data: reaction, error: upsertError } = await supabase
      .from("post_reactions")
      .upsert(
        {
          post_id,
          pet_id,
          reaction_type,
        },
        { onConflict: "post_id,pet_id" }
      )
      .select()
      .single();

    if (upsertError) throw upsertError;

    // 5. Notify post owner (if reacting to someone else's post)
    const postOwnerId = post.pets?.owner_id;
    if (postOwnerId && postOwnerId !== user.id) {
      // Get the name of reacting pet
      const { data: reactingPet } = await supabase
        .from("pets")
        .select("name")
        .eq("id", pet_id)
        .single();

      await createNotification(supabase, {
        recipient_id: postOwnerId,
        type: "POST_REACTION",
        payload: {
          post_id,
          reaction_type,
          reacting_pet_id: pet_id,
          reacting_pet_name: reactingPet?.name || "",
        },
      });
    }

    return ok(reaction);
  } catch (error) {
    return errorResponse(error);
  }
});

// Helper to extract query parameters if they are not in body
function getQueryParams(req: Request): Record<string, string> {
  const url = new URL(req.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}
