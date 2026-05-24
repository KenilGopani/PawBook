/**
 * Edge Function: invite-to-meetup
 *
 * Invite additional pets to an existing group meetup.
 *
 * POST /functions/v1/invite-to-meetup
 * Query Params / Body: meetup_id (or in path), pet_ids
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { ok, errorResponse, AppError, NotFoundError } from "../_shared/errors.ts";
import { createNotification, getQueryParams } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);

    const params = getQueryParams(req);
    const body = await req.json().catch(() => ({}));

    let meetup_id = params.meetup_id || params.id || body.meetup_id;
    const pet_ids = body.pet_ids;

    // Fallback: parse path param
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      meetup_id = meetup_id || pathParts[1];
    }

    if (!meetup_id || !Array.isArray(pet_ids) || pet_ids.length < 1) {
      throw new AppError("VALIDATION_ERROR", "meetup_id and a non-empty array of pet_ids are required", 400);
    }

    // 1. Fetch meetup
    const { data: meetup, error: meetupError } = await supabase
      .from("meetups")
      .select("id, status, organizer_id, is_group, max_pets, title")
      .eq("id", meetup_id)
      .single();

    if (meetupError || !meetup) {
      throw new NotFoundError("Meetup not found");
    }

    // 2. Validate organizer ownership
    if (meetup.organizer_id !== user.id) {
      throw new AppError("AUTH_FORBIDDEN", "Only the organizer can invite pets", 403);
    }

    // 3. Validate group meetup rules and state
    if (!meetup.is_group) {
      throw new AppError("INVALID_STATE", "Cannot invite more pets to a 1-on-1 meetup", 409);
    }

    if (meetup.status !== "PENDING" && meetup.status !== "ACCEPTED") {
      throw new AppError("INVALID_STATE", `Cannot invite pets to a meetup in status ${meetup.status}`, 409);
    }

    // 4. Check existing participant count (invited & accepted)
    const { count, error: countError } = await supabase
      .from("meetup_participants")
      .select("id", { count: "exact", head: true })
      .eq("meetup_id", meetup_id)
      .in("rsvp_status", ["ACCEPTED", "INVITED"]);

    if (countError) throw countError;
    const activeCount = count || 0;
    if (activeCount + pet_ids.length > meetup.max_pets) {
      throw new AppError("MEETUP_FULL", `Adding ${pet_ids.length} invite(s) would exceed max capacity of ${meetup.max_pets} (currently ${activeCount} active)`, 409);
    }

    // 5. Check if any target pets are already invited or participants
    const { data: existingParts, error: checkError } = await supabase
      .from("meetup_participants")
      .select("pet_id")
      .eq("meetup_id", meetup_id)
      .in("pet_id", pet_ids);

    if (checkError) throw checkError;
    if (existingParts && existingParts.length > 0) {
      const duplicateIds = existingParts.map((p) => p.pet_id);
      throw new AppError("DUPLICATE", `Pets already invited or participating: ${duplicateIds.join(", ")}`, 409);
    }

    // Verify all pet IDs exist and are active
    for (const petId of pet_ids) {
      const { data: pet, error: petQueryError } = await supabase
        .from("pets")
        .select("id, owner_id")
        .eq("id", petId)
        .eq("is_active", true)
        .single();

      if (petQueryError || !pet) {
        throw new AppError("NOT_FOUND", `Pet ${petId} not found or is inactive`, 404);
      }
    }

    // 6. Insert new invitations
    const invites = pet_ids.map((petId) => ({
      meetup_id: meetup.id,
      pet_id: petId,
      rsvp_status: "INVITED",
      invited_by: user.id,
    }));

    const { error: inviteError } = await supabase
      .from("meetup_participants")
      .insert(invites);

    if (inviteError) throw inviteError;

    // 7. Send notifications to invited pets' owners
    for (const petId of pet_ids) {
      const { data: pet } = await supabase
        .from("pets")
        .select("owner_id")
        .eq("id", petId)
        .single();

      if (pet) {
        await createNotification(supabase, {
          recipient_id: pet.owner_id,
          type: "MEETUP_REQUEST",
          payload: {
            meetup_id: meetup.id,
            meetup_title: meetup.title,
            invited_pet_id: petId,
          },
        });
      }
    }

    return ok({ invited_count: pet_ids.length });
  } catch (error) {
    return errorResponse(error);
  }
});
