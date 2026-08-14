/**
 * Edge Function: cancel-meetup
 *
 * Cancel a meetup. Only organizer can cancel.
 *
 * PATCH /functions/v1/cancel-meetup
 * Query Params / Body: meetup_id (or in path), reason
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
    const reason = body.reason || "";

    // Fallback: parse path param
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      meetup_id = meetup_id || pathParts[1];
    }

    if (!meetup_id) {
      throw new AppError("VALIDATION_ERROR", "meetup_id is required", 400);
    }

    // 1. Fetch meetup
    const { data: meetup, error: meetupError } = await supabase
      .from("meetups")
      .select("id, organizer_id, status, scheduled_at, title")
      .eq("id", meetup_id)
      .single();

    if (meetupError || !meetup) {
      throw new NotFoundError("Meetup not found");
    }

    // 2. Validate organizer ownership
    if (meetup.organizer_id !== user.id) {
      throw new AppError("AUTH_FORBIDDEN", "Only the organizer can cancel this meetup", 403);
    }

    // 3. Validate state
    const allowedStates = ["PENDING", "ACCEPTED", "SCHEDULED"];
    if (!allowedStates.includes(meetup.status)) {
      throw new AppError("INVALID_STATE", `Cannot cancel a meetup in status ${meetup.status}`, 409);
    }

    // 4. Validate SCHEDULED cancel buffer (> 2 hours before scheduled_at)
    if (meetup.status === "SCHEDULED" && meetup.scheduled_at) {
      const scheduledTime = new Date(meetup.scheduled_at).getTime();
      const twoHoursFromNow = Date.now() + 2 * 60 * 60 * 1000;
      if (scheduledTime < twoHoursFromNow) {
        throw new AppError(
          "TOO_LATE_TO_CANCEL",
          "Cannot cancel a scheduled meetup less than 2 hours before the start time",
          409,
        );
      }
    }

    // 5. Update meetup status to CANCELLED
    const { error: updateError } = await supabase
      .from("meetups")
      .update({
        status: "CANCELLED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", meetup_id);

    if (updateError) throw updateError;

    // 6. Notify all accepted/invited participants
    const { data: participants } = await supabase
      .from("meetup_participants")
      .select("pet_id, pets!pet_id(owner_id)")
      .eq("meetup_id", meetup_id)
      .in("rsvp_status", ["ACCEPTED", "INVITED"]);

    if (participants) {
      for (const p of participants) {
        const ownerId = p.pets?.owner_id;
        if (ownerId && ownerId !== user.id) {
          await createNotification(supabase, {
            recipient_id: ownerId,
            type: "MEETUP_CANCELLED",
            payload: {
              meetup_id,
              meetup_title: meetup.title,
              reason,
            },
          });
        }
      }
    }

    return ok({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
