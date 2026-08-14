/**
 * Edge Function: register-device-token
 *
 * Upserts the caller's APNs device token so push notifications (lost pet
 * alerts, community alerts) can reach their device.
 *
 * POST /functions/v1/register-device-token
 * Body: { device_token, platform? }
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { errorResponse, ok, ValidationError } from "../_shared/errors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const body = await req.json();

    const { device_token, platform = "ios" } = body;

    if (!device_token || typeof device_token !== "string" || device_token.length < 16) {
      throw new ValidationError("device_token is required", "device_token");
    }
    if (platform !== "ios") {
      throw new ValidationError("platform must be 'ios'", "platform");
    }

    const { error } = await supabase
      .from("device_push_tokens")
      .upsert(
        {
          owner_id: user.id,
          device_token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "device_token" },
      );

    if (error) throw error;

    return ok({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
