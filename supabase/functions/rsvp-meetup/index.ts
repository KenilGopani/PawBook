/**
 * Edge Function: rsvp-meetup
 *
 * Accept or decline a meetup invitation.
 *
 * POST /functions/v1/rsvp-meetup
 * Query Params / Body: meetup_id (or in path), pet_id, rsvp_status
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { AppError, errorResponse, NotFoundError, ok } from "../_shared/errors.ts";
import { assertPetOwner, createNotification, getQueryParams } from "../_shared/helpers.ts";
import { ALLOWED_RSVP_STATUSES } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);

    const params = getQueryParams(req);
    const body = await req.json().catch(() => ({}));

    let meetup_id = params.meetup_id || params.id || body.meetup_id;
    const pet_id = body.pet_id;
    const rsvp_status = body.rsvp_status;

    // Fallback: parse path param
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      meetup_id = meetup_id || pathParts[1];
    }

    if (!meetup_id || !pet_id || !rsvp_status) {
      throw new AppError(
        "VALIDATION_ERROR",
        "meetup_id, pet_id, and rsvp_status are required",
        400,
      );
    }

    if (!ALLOWED_RSVP_STATUSES.includes(rsvp_status as any)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `rsvp_status must be one of: ${ALLOWED_RSVP_STATUSES.join(", ")}`,
        400,
      );
    }

    // 1. Verify caller owns pet_id
    await assertPetOwner(supabase, user.id, pet_id);

    // 2. Fetch meetup
    const { data: meetup, error: meetupError } = await supabase
      .from("meetups")
      .select("id, status, organizer_id, is_group, max_pets, title")
      .eq("id", meetup_id)
      .single();

    if (meetupError || !meetup) {
      throw new NotFoundError("Meetup not found");
    }

    // Meetup must be PENDING or ACCEPTED
    if (meetup.status !== "PENDING" && meetup.status !== "ACCEPTED") {
      throw new AppError(
        "INVALID_STATE",
        `Cannot RSVP to a meetup in status ${meetup.status}`,
        409,
      );
    }

    // 3. Fetch participant record
    const { data: part, error: partError } = await supabase
      .from("meetup_participants")
      .select("id, rsvp_status")
      .eq("meetup_id", meetup_id)
      .eq("pet_id", pet_id)
      .maybeSingle();

    if (partError || !part) {
      throw new AppError("NOT_FOUND", "Pet is not invited to this meetup", 404);
    }

    if (part.rsvp_status !== "INVITED") {
      throw new AppError("INVALID_STATE", `Pet has already RSVP'd: ${part.rsvp_status}`, 409);
    }

    // 4. Check capacity (if accepting)
    if (rsvp_status === "ACCEPTED") {
      const { count, error: countError } = await supabase
        .from("meetup_participants")
        .select("id", { count: "exact", head: true })
        .eq("meetup_id", meetup_id)
        .eq("rsvp_status", "ACCEPTED");

      if (countError) throw countError;
      if (count !== null && count >= meetup.max_pets) {
        throw new AppError("MEETUP_FULL", "Meetup has reached maximum capacity", 409);
      }
    }

    // 5. Update RSVP status
    const { error: updateError } = await supabase
      .from("meetup_participants")
      .update({ rsvp_status })
      .eq("meetup_id", meetup_id)
      .eq("pet_id", pet_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // 6. Transition 1-on-1 meetup state if accepted
    if (!meetup.is_group && rsvp_status === "ACCEPTED") {
      const { error: meetupUpdateError } = await supabase
        .from("meetups")
        .update({ status: "ACCEPTED", updated_at: new Date().toISOString() })
        .eq("id", meetup_id);
      if (meetupUpdateError) throw meetupUpdateError;
    }

    // 7. Notify organizer
    const { data: pet } = await supabase
      .from("pets")
      .select("name")
      .eq("id", pet_id)
      .single();

    await createNotification(supabase, {
      recipient_id: meetup.organizer_id,
      type: rsvp_status === "ACCEPTED" ? "MEETUP_ACCEPTED" : "MEETUP_DECLINED",
      payload: {
        meetup_id,
        meetup_title: meetup.title,
        pet_id,
        pet_name: pet?.name || "A pet",
      },
    });

    return ok({
      meetup_id,
      pet_id,
      rsvp_status,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
