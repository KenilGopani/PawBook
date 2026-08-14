/**
 * Edge Function: delete-pet
 *
 * Soft-delete a pet:
 * 1. Verify caller owns the pet
 * 2. Set pets.is_active = false
 * 3. Set Neo4j Pet node: is_active = false
 * 4. Cancel any PENDING meetups involving this pet
 * 5. Remove FRIENDS_WITH relationships from Neo4j (keep VISITED history)
 *
 * POST /functions/v1/delete-pet
 * Body: { pet_id: string }
 *
 * See: 04_service_user_pet.md — DELETE /pets/:id
 */

import { handleCors } from "../_shared/cors.ts";
import { createAdminClient, createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import {
  errorResponse,
  ForbiddenError,
  NotFoundError,
  ok,
  ValidationError,
} from "../_shared/errors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const adminClient = createAdminClient();
    const body = await req.json();

    const petId = body.pet_id;
    if (!petId) {
      throw new ValidationError("pet_id is required", "pet_id");
    }

    // 1. Verify caller owns the pet
    const { data: pet, error: fetchError } = await supabase
      .from("pets")
      .select("id, owner_id")
      .eq("id", petId)
      .eq("is_active", true)
      .single();

    if (fetchError || !pet) {
      throw new NotFoundError("Pet not found");
    }

    if (pet.owner_id !== user.id) {
      throw new ForbiddenError("You do not own this pet");
    }

    const now = new Date().toISOString();

    // 2. Soft-delete in Supabase
    const { error: updateError } = await supabase
      .from("pets")
      .update({ is_active: false, updated_at: now })
      .eq("id", petId);

    if (updateError) throw updateError;

    // 3. Set Neo4j Pet node as inactive
    await neo4jQuery(
      `MATCH (p:Pet {id: $pet_id}) SET p.is_active = false`,
      { pet_id: petId },
    );

    // 4. Remove FRIENDS_WITH relationships (but keep VISITED for history)
    await neo4jQuery(
      `MATCH (p:Pet {id: $pet_id})-[r:FRIENDS_WITH]-() DELETE r`,
      { pet_id: petId },
    );

    // Also remove pending friend requests
    await neo4jQuery(
      `MATCH (p:Pet {id: $pet_id})-[r:SENT_REQUEST_TO]-() DELETE r`,
      { pet_id: petId },
    );

    // 5. Cancel PENDING meetups involving this pet
    // Find meetup IDs where this pet is a participant
    const { data: participations } = await adminClient
      .from("meetup_participants")
      .select("meetup_id")
      .eq("pet_id", petId);

    if (participations && participations.length > 0) {
      const meetupIds = participations.map((p: { meetup_id: string }) => p.meetup_id);

      // Cancel meetups that are still pending/scheduled and organized by this user
      await adminClient
        .from("meetups")
        .update({ status: "CANCELLED", updated_at: now })
        .in("id", meetupIds)
        .eq("organizer_id", user.id)
        .in("status", ["PENDING", "SCHEDULED"]);
    }

    return ok({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
