/**
 * Edge Function: complete-meetup
 *
 * Mark a meetup as completed. Triggered by a cron job or manually by the organizer.
 * Syncs activity to Neo4j and notifies participants to review.
 *
 * POST /functions/v1/complete-meetup
 * Body: { meetup_id }
 */

import { handleCors } from "../_shared/cors.ts";
import { createAdminClient, createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { AppError, errorResponse, NotFoundError, ok } from "../_shared/errors.ts";
import { createNotification } from "../_shared/helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const authHeader = req.headers.get("Authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceRole = authHeader === `Bearer ${serviceRoleKey}` ||
      authHeader === serviceRoleKey;

    let supabase;
    let isSystem = false;
    let user = null;

    if (isServiceRole) {
      supabase = createAdminClient();
      isSystem = true;
    } else {
      supabase = createUserClient(req);
      user = await getAuthUser(supabase);
    }

    const body = await req.json().catch(() => ({}));
    const { meetup_id } = body;

    if (!meetup_id) {
      throw new AppError("VALIDATION_ERROR", "meetup_id is required", 400);
    }

    // 1. Fetch meetup
    const { data: meetup, error: meetupError } = await supabase
      .from("meetups")
      .select("id, organizer_id, status, place_id, scheduled_at, title")
      .eq("id", meetup_id)
      .single();

    if (meetupError || !meetup) {
      throw new NotFoundError("Meetup not found");
    }

    // 2. Validate authorization
    if (!isSystem && meetup.organizer_id !== user?.id) {
      throw new AppError(
        "AUTH_FORBIDDEN",
        "Only the organizer or system can complete this meetup",
        403,
      );
    }

    // 3. Validate state
    if (meetup.status !== "SCHEDULED") {
      throw new AppError(
        "INVALID_STATE",
        `Cannot complete a meetup in status ${meetup.status}`,
        409,
      );
    }

    // 4. Update status to COMPLETED
    const { error: updateError } = await supabase
      .from("meetups")
      .update({
        status: "COMPLETED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", meetup_id);

    if (updateError) throw updateError;

    // 5. Get accepted participants
    const { data: participants, error: partError } = await supabase
      .from("meetup_participants")
      .select("pet_id, pets!pet_id(owner_id)")
      .eq("meetup_id", meetup_id)
      .eq("rsvp_status", "ACCEPTED");

    if (partError) throw partError;
    const acceptedParticipants = participants || [];
    const participantPetIds = acceptedParticipants.map((p) => p.pet_id);

    // 6. Update Neo4j (Visited place & Met at place)
    let edgesCreated = 0;
    if (meetup.place_id && participantPetIds.length > 0) {
      // Create VISITED edge for each participant
      for (const petId of participantPetIds) {
        await neo4jQuery(
          `
          MATCH (p:Pet {id: $pet_id}), (pl:Place {id: $place_id})
          MERGE (p)-[v:VISITED {visited_at: $visited_at}]->(pl)
          SET v.meetup_id = $meetup_id
          `,
          {
            pet_id: petId,
            place_id: meetup.place_id,
            visited_at: meetup.scheduled_at,
            meetup_id: meetup.id,
          },
        );
        edgesCreated++;
      }

      // Create MET_AT edges for all pairs
      for (let i = 0; i < participantPetIds.length; i++) {
        for (let j = i + 1; j < participantPetIds.length; j++) {
          await neo4jQuery(
            `
            MATCH (a:Pet {id: $a}), (b:Pet {id: $b}), (pl:Place {id: $place_id})
            MERGE (a)-[m1:MET_AT {meetup_id: $meetup_id}]->(pl)
            SET m1.met_at = $met_at
            MERGE (b)-[m2:MET_AT {meetup_id: $meetup_id}]->(pl)
            SET m2.met_at = $met_at
            `,
            {
              a: participantPetIds[i],
              b: participantPetIds[j],
              place_id: meetup.place_id,
              meetup_id: meetup.id,
              met_at: meetup.scheduled_at,
            },
          );
          edgesCreated += 2;
        }
      }
    }

    // 7. Notify participants to prompt review
    for (const participant of acceptedParticipants) {
      const ownerId = participant.pets?.owner_id;
      if (ownerId) {
        await createNotification(supabase, {
          recipient_id: ownerId,
          type: "MEETUP_COMPLETED",
          payload: {
            meetup_id: meetup.id,
            meetup_title: meetup.title,
            prompt_review: true,
          },
        });
      }
    }

    return ok({
      success: true,
      participants_synced: acceptedParticipants.length,
      neo4j_edges_created: edgesCreated,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
