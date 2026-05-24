/**
 * Edge Function: create-community-alert
 *
 * Post a community safety alert and notify users within radius.
 * Rate limited to 3 alerts per 24 hours per user.
 *
 * POST /functions/v1/create-community-alert
 * Body: { alert_type, lat, lng, radius_km, description, expires_hours }
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { created, errorResponse, AppError } from "../_shared/errors.ts";
import { ALLOWED_ALERT_TYPES } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const body = await req.json();

    const {
      alert_type,
      lat,
      lng,
      radius_km = 2,
      description,
      expires_hours = 4,
    } = body;

    // 1. Input Validation
    if (!alert_type || lat === undefined || lng === undefined || !description) {
      throw new AppError("VALIDATION_ERROR", "alert_type, lat, lng, and description are required", 400);
    }

    if (!ALLOWED_ALERT_TYPES.includes(alert_type as any)) {
      throw new AppError("VALIDATION_ERROR", `alert_type must be one of: ${ALLOWED_ALERT_TYPES.join(", ")}`, 400);
    }

    if (typeof lat !== "number" || lat < -90 || lat > 90) {
      throw new AppError("VALIDATION_ERROR", "lat must be a number between -90 and 90", 400);
    }

    if (typeof lng !== "number" || lng < -180 || lng > 180) {
      throw new AppError("VALIDATION_ERROR", "lng must be a number between -180 and 180", 400);
    }

    if (radius_km < 1 || radius_km > 10) {
      throw new AppError("VALIDATION_ERROR", "radius_km must be between 1 and 10", 400);
    }

    if (description.length < 10 || description.length > 300) {
      throw new AppError("VALIDATION_ERROR", "description must be between 10 and 300 characters", 400);
    }

    if (expires_hours < 1 || expires_hours > 48) {
      throw new AppError("VALIDATION_ERROR", "expires_hours must be between 1 and 48", 400);
    }

    // 2. Rate limit check (Max 3 alerts per 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("community_alerts")
      .select("id", { count: "exact", head: true })
      .eq("reporter_id", user.id)
      .gte("created_at", twentyFourHoursAgo);

    if (countError) throw countError;

    if (count !== null && count >= 3) {
      throw new AppError("RATE_LIMITED", "Max 3 community alerts per user per 24 hours", 429);
    }

    // 3. Insert alert
    const expiresAt = new Date(Date.now() + expires_hours * 3600000).toISOString();

    const { data: alert, error: insertError } = await supabase
      .from("community_alerts")
      .insert({
        reporter_id: user.id,
        alert_type,
        location: `POINT(${lng} ${lat})`,
        radius_km,
        description,
        expires_at: expiresAt,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 4. Notify nearby users
    const { data: nearbyUsers, error: rpcError } = await supabase.rpc("users_within_radius", {
      p_lat: lat,
      p_lng: lng,
      p_radius_m: radius_km * 1000,
    });

    if (rpcError) throw rpcError;

    const notifications = (nearbyUsers || [])
      .filter((u: any) => u.id !== user.id)
      .map((u: any) => ({
        recipient_id: u.id,
        type: "COMMUNITY_ALERT",
        payload: {
          alert_id: alert.id,
          alert_type,
          lat,
          lng,
          description,
          expires_at: expiresAt,
        },
      }));

    // Insert in batches of 500
    for (let i = 0; i < notifications.length; i += 500) {
      await supabase.from("notifications").insert(notifications.slice(i, i + 500));
    }

    return created({
      alert: {
        id: alert.id,
        alert_type,
        lat,
        lng,
        radius_km,
        description,
        expires_at: expiresAt,
        is_active: alert.is_active,
        created_at: alert.created_at,
      },
      notified_count: notifications.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
