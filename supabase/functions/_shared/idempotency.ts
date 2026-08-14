/**
 * Idempotency-Key support for mutating Edge Functions.
 *
 * See: 11_api_conventions.md — "Idempotency"
 *   1. Client generates a UUID and sends it as `Idempotency-Key`.
 *   2. Server stores the result against (user, endpoint, key) for 24h.
 *   3. A duplicate call with the same key replays the cached result
 *      instead of re-running the mutation.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

/**
 * Run `handler` with Idempotency-Key support.
 *
 * If the request has no `Idempotency-Key` header, this is a no-op passthrough
 * — `handler()` just runs normally. If the header is present and a cached
 * result exists for (userId, endpoint, key), that cached response is
 * replayed and `handler` is never called, so duplicate requests (retries
 * over a flaky mobile connection) can't create the resource twice.
 *
 * Only successful (2xx) results are cached — a validation error or
 * transient failure should remain retryable with the same key.
 */
export async function withIdempotency(
  req: Request,
  supabase: SupabaseClient,
  userId: string,
  endpoint: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  const key = req.headers.get("Idempotency-Key");
  if (!key) return handler();

  const { data: existing } = await supabase
    .from("idempotency_keys")
    .select("status_code, response_body")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .eq("key", key)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify(existing.response_body), {
      status: existing.status_code,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Idempotent-Replayed": "true",
      },
    });
  }

  const response = await handler();

  if (response.status >= 200 && response.status < 300) {
    const body = await response.clone().json().catch(() => null);
    const { error } = await supabase.from("idempotency_keys").insert({
      key,
      user_id: userId,
      endpoint,
      status_code: response.status,
      response_body: body,
    });
    // A unique-violation here means a concurrent duplicate request won the
    // race to cache first — harmless, both requests already succeeded.
    if (error && error.code !== "23505") {
      console.error(`Failed to store idempotency result for ${endpoint}:`, error);
    }
  }

  return response;
}
