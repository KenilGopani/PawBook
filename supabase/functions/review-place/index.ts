/**
 * Edge Function: review-place
 *
 * Add or edit a review for a place. One review per user per place.
 * DB triggers in Supabase automatically calculate and update the place's avg_rating.
 *
 * POST /functions/v1/review-place
 * Query Params / Body: place_id (or in path), rating, body
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { AppError, errorResponse, NotFoundError, ok } from "../_shared/errors.ts";
import { getQueryParams } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);

    const params = getQueryParams(req);
    const body = await req.json().catch(() => ({}));

    let place_id = params.place_id || params.id || body.place_id;
    const rating = body.rating;
    const reviewBody = body.body || "";

    // Fallback: parse path param
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      place_id = place_id || pathParts[1];
    }

    if (!place_id || rating === undefined) {
      throw new AppError("VALIDATION_ERROR", "place_id and rating are required", 400);
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new AppError("VALIDATION_ERROR", "rating must be an integer between 1 and 5", 400);
    }

    if (reviewBody && reviewBody.length > 500) {
      throw new AppError("VALIDATION_ERROR", "review body must be under 500 characters", 400);
    }

    // Verify place exists
    const { data: place, error: placeError } = await supabase
      .from("places")
      .select("id")
      .eq("id", place_id)
      .single();

    if (placeError || !place) {
      throw new NotFoundError("Place not found");
    }

    // Upsert review (allow editing own review)
    const { data: review, error: upsertError } = await supabase
      .from("place_reviews")
      .upsert(
        {
          place_id,
          author_id: user.id,
          rating,
          body: reviewBody || null,
        },
        { onConflict: "place_id,author_id" },
      )
      .select()
      .single();

    if (upsertError) throw upsertError;

    return ok(review);
  } catch (error) {
    return errorResponse(error);
  }
});
