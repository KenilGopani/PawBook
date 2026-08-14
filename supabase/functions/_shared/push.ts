/**
 * Fan-out helper: send an APNs push to every device registered to a set
 * of owners. Best-effort — a push failure never throws back to the caller,
 * matching createNotification()'s "non-fatal" pattern in helpers.ts.
 */

import { createAdminClient } from "./supabase.ts";
import { ApnsInvalidTokenError, ApnsPayload, sendApnsPush } from "./apns.ts";

/**
 * Send `payload` to every device token registered to `ownerIds`.
 * Uses the service-role admin client internally since RLS on
 * device_push_tokens restricts reads to a user's own tokens.
 */
export async function sendPushToOwners(
  ownerIds: string[],
  payload: ApnsPayload,
): Promise<void> {
  if (ownerIds.length === 0) return;

  const admin = createAdminClient();
  const { data: tokens, error } = await admin
    .from("device_push_tokens")
    .select("device_token")
    .in("owner_id", ownerIds);

  if (error) {
    console.error("Failed to load device push tokens:", error);
    return;
  }
  if (!tokens || tokens.length === 0) return;

  await Promise.allSettled(
    tokens.map(async (row: { device_token: string }) => {
      try {
        await sendApnsPush(row.device_token, payload);
      } catch (err) {
        if (err instanceof ApnsInvalidTokenError) {
          await admin.from("device_push_tokens").delete().eq("device_token", row.device_token);
        } else {
          console.error("Push send failed:", err);
        }
      }
    }),
  );
}
