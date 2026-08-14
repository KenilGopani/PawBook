/**
 * Edge Function: delete-account
 *
 * Soft-delete user account:
 * 1. Set profiles.is_active = false
 * 2. Set all pets.is_active = false
 * 3. Set Neo4j Pet nodes: is_active = false
 * 4. Cancel all PENDING/SCHEDULED meetups where organizer
 * 5. DO NOT delete auth.users (retained for 30 days per data policy)
 * 6. Sign out all sessions
 *
 * POST /functions/v1/delete-account
 * Body: { confirm: "DELETE MY ACCOUNT" }
 *
 * See: 04_service_user_pet.md — DELETE /profile/me
 */

import { handleCors } from "../_shared/cors.ts";
import { createAdminClient, createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { AppError, errorResponse, ok } from "../_shared/errors.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const adminClient = createAdminClient();
    const body = await req.json();

    // Require explicit confirmation
    if (body.confirm !== "DELETE MY ACCOUNT") {
      throw new AppError(
        "VALIDATION_ERROR",
        'Confirmation required: send { "confirm": "DELETE MY ACCOUNT" }',
        400,
      );
    }

    const now = new Date().toISOString();

    // 1. Soft-delete profile
    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ is_active: false, updated_at: now })
      .eq("id", user.id);

    if (profileError) throw profileError;

    // 2. Soft-delete all pets
    const { data: pets } = await adminClient
      .from("pets")
      .select("id")
      .eq("owner_id", user.id)
      .eq("is_active", true);

    if (pets && pets.length > 0) {
      const { error: petsError } = await adminClient
        .from("pets")
        .update({ is_active: false, updated_at: now })
        .eq("owner_id", user.id);

      if (petsError) throw petsError;

      // 3. Set Neo4j Pet nodes as inactive
      for (const pet of pets) {
        await neo4jQuery(
          `
          MATCH (p:Pet {id: $pet_id})
          SET p.is_active = false
          `,
          { pet_id: pet.id },
        );
      }
    }

    // 4. Cancel pending/scheduled meetups organized by this user
    const { error: meetupError } = await adminClient
      .from("meetups")
      .update({ status: "CANCELLED", updated_at: now })
      .eq("organizer_id", user.id)
      .in("status", ["PENDING", "SCHEDULED"]);

    if (meetupError) throw meetupError;

    // 5. Sign out all sessions (using admin client)
    const { error: signOutError } = await adminClient.auth.admin.signOut(
      user.id,
    );

    // Sign-out error is non-fatal — log but don't throw
    if (signOutError) {
      console.error("Sign-out error (non-fatal):", signOutError);
    }

    return ok({
      success: true,
      message: "Account deactivated. Data retained for 30 days.",
    });
  } catch (error) {
    return errorResponse(error);
  }
});
