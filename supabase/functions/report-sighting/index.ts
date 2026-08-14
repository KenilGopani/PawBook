/**
 * Edge Function: report-sighting
 *
 * Report a sighting of a lost pet. Sends a real-time notification to the alert owner.
 *
 * POST /functions/v1/report-sighting
 * Query Params / Body: alert_id (or in path), lat, lng, note
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

    let alert_id = params.alert_id || params.id || body.alert_id;
    const { lat, lng, note } = body;

    // Fallback: parse path param
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      alert_id = alert_id || pathParts[1];
    }

    if (!alert_id || lat === undefined || lng === undefined || !note) {
      throw new AppError("VALIDATION_ERROR", "alert_id, lat, lng, and note are required", 400);
    }

    if (typeof lat !== "number" || lat < -90 || lat > 90) {
      throw new AppError("VALIDATION_ERROR", "lat must be a number between -90 and 90", 400);
    }
    if (typeof lng !== "number" || lng < -180 || lng > 180) {
      throw new AppError("VALIDATION_ERROR", "lng must be a number between -180 and 180", 400);
    }
    if (note.length > 500) {
      throw new AppError("VALIDATION_ERROR", "note must be under 500 characters", 400);
    }

    // 1. Verify alert is ACTIVE
    const { data: alert, error: alertError } = await supabase
      .from("lost_pet_alerts")
      .select("id, reporter_id, status")
      .eq("id", alert_id)
      .single();

    if (alertError || !alert) {
      throw new NotFoundError("Lost pet alert not found");
    }

    if (alert.status !== "ACTIVE") {
      throw new AppError(
        "ALERT_EXPIRED",
        `Cannot report a sighting for an alert that is ${alert.status}`,
        409,
      );
    }

    // 2. Fetch reporter profile to get display name
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    // 3. Create sighting notification to alert reporter
    await createNotification(supabase, {
      recipient_id: alert.reporter_id,
      type: "PET_SIGHTING",
      payload: {
        alert_id,
        sighting_lat: lat,
        sighting_lng: lng,
        note,
        reporter_display_name: profile?.display_name || "Another owner",
      },
    });

    return ok({ success: true, message: "Sighting reported to the pet owner" });
  } catch (error) {
    return errorResponse(error);
  }
});
