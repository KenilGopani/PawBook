/**
 * Edge Function: schedule-meetup
 *
 * Set or update the date, time, and location of a meetup, transitioning status to SCHEDULED.
 *
 * PATCH /functions/v1/schedule-meetup
 * Query Params / Body: meetup_id (or in path), scheduled_at, place_id, custom_location, custom_address
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { AppError, errorResponse, NotFoundError, ok } from "../_shared/errors.ts";
import { createNotification, getQueryParams } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);

    const params = getQueryParams(req);
    const body = await req.json().catch(() => ({}));

    let meetup_id = params.meetup_id || params.id || body.meetup_id;
    // Fallback: parse from path
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      meetup_id = meetup_id || pathParts[1];
    }

    if (!meetup_id) {
      throw new AppError("VALIDATION_ERROR", "meetup_id is required", 400);
    }

    const { scheduled_at, place_id, custom_location, custom_address } = body;

    // 1. Fetch meetup and check existence and ownership
    const { data: meetup, error: meetupError } = await supabase
      .from("meetups")
      .select("id, organizer_id, status, title")
      .eq("id", meetup_id)
      .single();

    if (meetupError || !meetup) {
      throw new NotFoundError("Meetup not found");
    }

    if (meetup.organizer_id !== user.id) {
      throw new AppError("AUTH_FORBIDDEN", "Only the organizer can schedule the meetup", 403);
    }

    // 2. Validate state
    if (meetup.status !== "PENDING" && meetup.status !== "ACCEPTED") {
      throw new AppError(
        "INVALID_STATE",
        `Cannot schedule a meetup in status ${meetup.status}`,
        409,
      );
    }

    if (!scheduled_at) {
      throw new AppError("VALIDATION_ERROR", "scheduled_at is required", 400);
    }

    const scheduledDate = new Date(scheduled_at);
    if (isNaN(scheduledDate.getTime())) {
      throw new AppError("VALIDATION_ERROR", "Invalid scheduled_at date format", 400);
    }

    const minFutureTime = Date.now() + 60 * 60 * 1000 - 60 * 1000;
    if (scheduledDate.getTime() < minFutureTime) {
      throw new AppError(
        "VALIDATION_ERROR",
        "scheduled_at must be at least 1 hour in the future",
        400,
      );
    }

    if (!place_id && !custom_location) {
      throw new AppError("VALIDATION_ERROR", "Either place_id or custom_location is required", 400);
    }

    if (place_id) {
      const { data: place } = await supabase
        .from("places")
        .select("id")
        .eq("id", place_id)
        .single();
      if (!place) {
        throw new AppError("NOT_FOUND", "Specified place not found", 404);
      }
    }

    // Format Point for PostGIS if custom_location is provided
    let pointStr = null;
    if (custom_location) {
      const { lat, lng } = custom_location;
      if (typeof lat !== "number" || typeof lng !== "number") {
        throw new AppError(
          "VALIDATION_ERROR",
          "custom_location must have numeric lat and lng",
          400,
        );
      }
      pointStr = `POINT(${lng} ${lat})`;
    }

    // 3. Update meetup in Supabase
    const { data: updatedMeetup, error: updateError } = await supabase
      .from("meetups")
      .update({
        scheduled_at: scheduledDate.toISOString(),
        place_id: place_id || null,
        custom_location: pointStr,
        custom_address: custom_address || null,
        status: "SCHEDULED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", meetup_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // 4. Notify all accepted participants (except organizer)
    // Get all accepted participant pets and their owners
    const { data: participants, error: partError } = await supabase
      .from("meetup_participants")
      .select("pet_id, pets!pet_id(owner_id)")
      .eq("meetup_id", meetup_id)
      .eq("rsvp_status", "ACCEPTED");

    if (!partError && participants) {
      for (const p of participants) {
        const ownerId = p.pets?.owner_id;
        if (ownerId && ownerId !== user.id) {
          await createNotification(supabase, {
            recipient_id: ownerId,
            type: "MEETUP_SCHEDULED",
            payload: {
              meetup_id,
              meetup_title: meetup.title,
              scheduled_at: updatedMeetup.scheduled_at,
            },
          });
        }
      }
    }

    return ok(updatedMeetup);
  } catch (error) {
    return errorResponse(error);
  }
});
