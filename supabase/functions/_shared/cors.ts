/**
 * CORS headers for Supabase Edge Functions.
 * Handles preflight OPTIONS requests and adds CORS headers to all responses.
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

/**
 * Handle CORS preflight request.
 * Call this at the top of every Edge Function handler.
 *
 * @example
 * if (req.method === "OPTIONS") return handleCors();
 */
export function handleCors(): Response {
  return new Response("ok", { headers: corsHeaders });
}

/**
 * Add CORS headers to an existing Response.
 */
export function withCors(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
