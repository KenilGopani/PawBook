/**
 * Edge Function: create-lost-pet-alert
 *
 * Report a lost pet and notify nearby pet owners in real-time.
 *
 * POST /functions/v1/create-lost-pet-alert
 * Body: { pet_id, last_seen_lat, last_seen_lng, last_seen_at, description, contact_info, photo_url, notify_radius_km }
 * Header: Idempotency-Key (optional) — see 11_api_conventions.md
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { AppError, created, errorResponse, NotFoundError } from "../_shared/errors.ts";
import { assertPetOwner } from "../_shared/helpers.ts";
import { sendPushToOwners } from "../_shared/push.ts";
import { buildLostPetPushPayload } from "../_shared/apns.ts";
import { withIdempotency } from "../_shared/idempotency.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);

    return await withIdempotency(req, supabase, user.id, "create-lost-pet-alert", async () => {
      const body = await req.json();

      const {
        pet_id,
        last_seen_lat,
        last_seen_lng,
        last_seen_at,
        description,
        contact_info,
        photo_url,
        notify_radius_km = 3,
      } = body;

      // 1. Validation
      if (
        !pet_id || last_seen_lat === undefined || last_seen_lng === undefined || !last_seen_at ||
        !description || !contact_info
      ) {
        throw new AppError(
          "VALIDATION_ERROR",
          "pet_id, last_seen_lat, last_seen_lng, last_seen_at, description, and contact_info are required",
          400,
        );
      }

      if (description.length < 10 || description.length > 500) {
        throw new AppError(
          "VALIDATION_ERROR",
          "description must be between 10 and 500 characters",
          400,
        );
      }

      if (contact_info.length > 200) {
        throw new AppError("VALIDATION_ERROR", "contact_info must be under 200 characters", 400);
      }

      if (notify_radius_km < 1 || notify_radius_km > 10) {
        throw new AppError("VALIDATION_ERROR", "notify_radius_km must be between 1 and 10", 400);
      }

      const lastSeenDate = new Date(last_seen_at);
      if (isNaN(lastSeenDate.getTime())) {
        throw new AppError("VALIDATION_ERROR", "Invalid last_seen_at date format", 400);
      }

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      if (
        lastSeenDate.getTime() < sevenDaysAgo || lastSeenDate.getTime() > Date.now() + 60 * 1000
      ) {
        throw new AppError("VALIDATION_ERROR", "last_seen_at must be within the last 7 days", 400);
      }

      // Verify caller owns pet
      await assertPetOwner(supabase, user.id, pet_id);

      // Get pet name
      const { data: petData, error: petError } = await supabase
        .from("pets")
        .select("name")
        .eq("id", pet_id)
        .single();

      if (petError || !petData) {
        throw new NotFoundError("Pet not found");
      }

      // 2. Check no active alert for this pet already
      const { data: existing } = await supabase
        .from("lost_pet_alerts")
        .select("id")
        .eq("pet_id", pet_id)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (existing) {
        throw new AppError("DUPLICATE", "An active alert already exists for this pet", 409);
      }

      // 3. Create alert
      const { data: alert, error: insertError } = await supabase
        .from("lost_pet_alerts")
        .insert({
          pet_id,
          reporter_id: user.id,
          last_seen_location: `POINT(${last_seen_lng} ${last_seen_lat})`,
          last_seen_at: lastSeenDate.toISOString(),
          description,
          contact_info,
          photo_url: photo_url || null,
          status: "ACTIVE",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // 4. Find all users within radius using PostGIS
      const { data: nearbyUsers, error: rpcError } = await supabase.rpc("users_within_radius", {
        p_lat: last_seen_lat,
        p_lng: last_seen_lng,
        p_radius_m: notify_radius_km * 1000,
      });

      if (rpcError) throw rpcError;

      // 5. Batch-insert notifications for all nearby users (excluding reporter)
      const notifications = (nearbyUsers || [])
        .filter((u: any) => u.id !== user.id)
        .map((u: any) => ({
          recipient_id: u.id,
          type: "LOST_PET_NEARBY",
          payload: {
            alert_id: alert.id,
            pet_id,
            pet_name: petData.name,
            last_seen_lat,
            last_seen_lng,
            description,
            photo_url: photo_url || null,
          },
        }));

      // Insert in batches of 500
      for (let i = 0; i < notifications.length; i += 500) {
        await supabase.from("notifications").insert(notifications.slice(i, i + 500));
      }

      // 6. Push notification — best-effort, never fails the request.
      // See: 09_service_alerts.md — "Push Notification Payloads (APNs)"
      try {
        await sendPushToOwners(
          notifications.map((n: { recipient_id: string }) => n.recipient_id),
          buildLostPetPushPayload({
            alertId: alert.id,
            petName: petData.name,
            breed: null,
            radiusKm: notify_radius_km,
          }),
        );
      } catch (err) {
        console.error("Failed to send lost-pet push notifications:", err);
      }

      return created({
        alert: {
          id: alert.id,
          pet_id: alert.pet_id,
          last_seen_lat,
          last_seen_lng,
          last_seen_at: alert.last_seen_at,
          description: alert.description,
          contact_info: alert.contact_info,
          photo_url: alert.photo_url,
          status: alert.status,
          created_at: alert.created_at,
        },
        notified_count: notifications.length,
      });
    });
  } catch (error) {
    return errorResponse(error);
  }
});
