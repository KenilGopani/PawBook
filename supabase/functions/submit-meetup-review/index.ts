/**
 * Edge Function: submit-meetup-review
 *
 * Submit a post-meetup review for another pet that attended.
 * Updates Neo4j compatibility score based on rating.
 *
 * POST /functions/v1/submit-meetup-review
 * Query Params / Body: meetup_id (or in path), reviewer_pet_id, reviewed_pet_id, rating, notes
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { AppError, created, errorResponse, NotFoundError } from "../_shared/errors.ts";
import { assertPetOwner, getQueryParams } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);

    const params = getQueryParams(req);
    const body = await req.json().catch(() => ({}));

    let meetup_id = params.meetup_id || params.id || body.meetup_id;
    const reviewer_pet_id = body.reviewer_pet_id;
    const reviewed_pet_id = body.reviewed_pet_id;
    const rating = body.rating;
    const notes = body.notes || "";

    // Fallback: parse path param
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      meetup_id = meetup_id || pathParts[1];
    }

    if (!meetup_id || !reviewer_pet_id || !reviewed_pet_id || rating === undefined) {
      throw new AppError(
        "VALIDATION_ERROR",
        "meetup_id, reviewer_pet_id, reviewed_pet_id, and rating are required",
        400,
      );
    }

    if (reviewer_pet_id === reviewed_pet_id) {
      throw new AppError("VALIDATION_ERROR", "You cannot review your own pet", 400);
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new AppError("VALIDATION_ERROR", "rating must be an integer between 1 and 5", 400);
    }

    if (notes && notes.length > 300) {
      throw new AppError("VALIDATION_ERROR", "notes must be under 300 characters", 400);
    }

    // 1. Verify caller owns reviewer_pet_id
    await assertPetOwner(supabase, user.id, reviewer_pet_id);

    // 2. Fetch meetup
    const { data: meetup, error: meetupError } = await supabase
      .from("meetups")
      .select("id, status")
      .eq("id", meetup_id)
      .single();

    if (meetupError || !meetup) {
      throw new NotFoundError("Meetup not found");
    }

    if (meetup.status !== "COMPLETED") {
      throw new AppError(
        "INVALID_STATE",
        "Reviews can only be submitted for completed meetups",
        409,
      );
    }

    // 3. Verify both pets were ACCEPTED participants
    const { data: parts, error: partsError } = await supabase
      .from("meetup_participants")
      .select("pet_id, rsvp_status")
      .eq("meetup_id", meetup_id)
      .in("pet_id", [reviewer_pet_id, reviewed_pet_id]);

    if (partsError) throw partsError;

    const reviewerPart = parts?.find((p) => p.pet_id === reviewer_pet_id);
    const reviewedPart = parts?.find((p) => p.pet_id === reviewed_pet_id);

    if (!reviewerPart || reviewerPart.rsvp_status !== "ACCEPTED") {
      throw new AppError("AUTH_FORBIDDEN", "Reviewer must be an accepted participant", 403);
    }

    if (!reviewedPart || reviewedPart.rsvp_status !== "ACCEPTED") {
      throw new AppError("VALIDATION_ERROR", "Reviewed pet must be an accepted participant", 400);
    }

    // 4. Insert review into Supabase
    const { data: review, error: insertError } = await supabase
      .from("meetup_reviews")
      .insert({
        meetup_id,
        reviewer_pet_id,
        reviewed_pet_id,
        rating,
        notes: notes || null,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        throw new AppError(
          "DUPLICATE",
          "You have already submitted a review for this pet in this meetup",
          409,
        );
      }
      throw insertError;
    }

    // 5. Update compatibility score in Neo4j (positive review -> boost, negative -> penalty)
    const compatibilityBoost = rating >= 4 ? 5 : rating <= 2 ? -5 : 0;
    if (compatibilityBoost !== 0) {
      await neo4jQuery(
        `
        MATCH (a:Pet {id: $a})-[r:FRIENDS_WITH]-(b:Pet {id: $b})
        SET r.compatibility = CASE
            WHEN r.compatibility + $boost > 100 THEN 100
            WHEN r.compatibility + $boost < 0 THEN 0
            ELSE r.compatibility + $boost
        END
        `,
        { a: reviewer_pet_id, b: reviewed_pet_id, boost: compatibilityBoost },
      );
    }

    return created(review);
  } catch (error) {
    return errorResponse(error);
  }
});
