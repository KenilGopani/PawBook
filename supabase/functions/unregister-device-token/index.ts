/**
 * Edge Function: unregister-device-token
 *
 * Removes a device token (e.g. on logout / notification opt-out) so pushes
 * stop reaching that device.
 *
 * DELETE /functions/v1/unregister-device-token
 * Body: { device_token }
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

    const { device_token } = body;
    if (!device_token || typeof device_token !== "string") {
      throw new ValidationError("device_token is required", "device_token");
    }

    // RLS (device_push_tokens_delete) already restricts this to the
    // caller's own tokens; the owner_id filter here is defense in depth.
    const { error } = await supabase
      .from("device_push_tokens")
      .delete()
      .eq("device_token", device_token)
      .eq("owner_id", user.id);

    if (error) throw error;

    return ok({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
