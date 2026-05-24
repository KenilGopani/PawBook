/**
 * Edge Function: create-meetup
 *
 * Create a new meetup request. Inserts meetup, organizer participant,
 * invitee participants, and triggers notifications.
 *
 * POST /functions/v1/create-meetup
 * Body: { title, description, organizer_pet_id, invited_pet_ids, place_id, scheduled_at, max_pets, is_group }
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { created, errorResponse, AppError } from "../_shared/errors.ts";
import { assertPetOwner, checkBlocked, createNotification } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const body = await req.json();

    const {
      title,
      description,
      organizer_pet_id,
      invited_pet_ids = [],
      place_id,
      scheduled_at,
      max_pets = 10,
      is_group,
    } = body;

    // 1. Validation
    if (!title || typeof title !== "string" || title.length < 3 || title.length > 100) {
      throw new AppError("VALIDATION_ERROR", "title is required and must be 3–100 characters", 400);
    }
    if (description && (typeof description !== "string" || description.length > 500)) {
      throw new AppError("VALIDATION_ERROR", "description must be under 500 characters", 400);
    }
    if (!organizer_pet_id) {
      throw new AppError("VALIDATION_ERROR", "organizer_pet_id is required", 400);
    }
    if (!Array.isArray(invited_pet_ids) || invited_pet_ids.length < 1 || invited_pet_ids.length > 9) {
      throw new AppError("VALIDATION_ERROR", "invited_pet_ids must be an array of 1 to 9 pet IDs", 400);
    }
    if (is_group === undefined || typeof is_group !== "boolean") {
      throw new AppError("VALIDATION_ERROR", "is_group is a required boolean", 400);
    }
    if (max_pets < 2 || max_pets > 20) {
      throw new AppError("VALIDATION_ERROR", "max_pets must be between 2 and 20", 400);
    }

    if (scheduled_at) {
      const scheduledDate = new Date(scheduled_at);
      if (isNaN(scheduledDate.getTime())) {
        throw new AppError("VALIDATION_ERROR", "Invalid scheduled_at date format", 400);
      }
      const minFutureTime = Date.now() + 60 * 60 * 1000 - 60 * 1000; // ~1 hour from now with buffer
      if (scheduledDate.getTime() < minFutureTime) {
        throw new AppError("VALIDATION_ERROR", "scheduled_at must be at least 1 hour in the future", 400);
      }
    }

    // Business rules validation
    if (!is_group && invited_pet_ids.length !== 1) {
      throw new AppError("VALIDATION_ERROR", "1-on-1 meetups must have exactly 1 invited pet", 400);
    }

    // Verify caller owns organizer_pet_id
    await assertPetOwner(supabase, user.id, organizer_pet_id);

    // Verify all invited pets exist, are active, and are not blocked
    for (const petId of invited_pet_ids) {
      if (petId === organizer_pet_id) {
        throw new AppError("VALIDATION_ERROR", "Cannot invite the organizer pet", 400);
      }

      const { data: pet, error: petError } = await supabase
        .from("pets")
        .select("id, owner_id")
        .eq("id", petId)
        .eq("is_active", true)
        .single();

      if (petError || !pet) {
        throw new AppError("NOT_FOUND", `Invited pet ${petId} not found or is inactive`, 404);
      }

      // Check if blocked
      const blocked = await checkBlocked(supabase, organizer_pet_id, petId);
      if (blocked) {
        throw new AppError("BLOCKED", `Pet ${petId} has a blocked relationship with the organizer pet`, 403);
      }
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

    // 2. Insert meetup
    const { data: meetup, error: insertError } = await supabase
      .from("meetups")
      .insert({
        organizer_id: user.id,
        title,
        description: description || null,
        place_id: place_id || null,
        scheduled_at: scheduled_at || null,
        max_pets,
        is_group,
        status: "PENDING",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 3. Add organizer's pet as ACCEPTED participant
    const { error: partOrganizerError } = await supabase
      .from("meetup_participants")
      .insert({
        meetup_id: meetup.id,
        pet_id: organizer_pet_id,
        rsvp_status: "ACCEPTED",
        invited_by: user.id,
      });

    if (partOrganizerError) throw partOrganizerError;

    // 4. Add invited pets as INVITED participants
    const invites = invited_pet_ids.map((petId) => ({
      meetup_id: meetup.id,
      pet_id: petId,
      rsvp_status: "INVITED",
      invited_by: user.id,
    }));

    const { error: inviteError } = await supabase
      .from("meetup_participants")
      .insert(invites);

    if (inviteError) throw inviteError;

    // 5. Notify each invited pet's owner
    for (const petId of invited_pet_ids) {
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
            organizer_pet_id,
            invited_pet_id: petId,
          },
        });
      }
    }

    return created({
      ...meetup,
      participants: [organizer_pet_id, ...invited_pet_ids],
    });
  } catch (error) {
    return errorResponse(error);
  }
});
