/**
 * Supabase client factories for Edge Functions.
 *
 * Two client types:
 * 1. User-scoped client — runs queries under RLS for the requesting user
 * 2. Admin client — uses service role key, bypasses RLS (for Neo4j sync, etc.)
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Create a Supabase client scoped to the requesting user.
 * All queries run under RLS for the user identified by the JWT in the Authorization header.
 *
 * @param req - The incoming request (must have Authorization header)
 * @returns Supabase client scoped to the user
 */
export function createUserClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: authHeader },
      },
    },
  );
}

/**
 * Create a Supabase admin client with service role key.
 * Bypasses RLS — use only for trusted server-side operations.
 *
 * @returns Supabase admin client
 */
export function createAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Extract the authenticated user from the request.
 * Throws if the JWT is invalid or expired.
 *
 * @param supabase - User-scoped Supabase client
 * @returns The authenticated user object
 */
export async function getAuthUser(supabase: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized");
  }

  return user;
}
