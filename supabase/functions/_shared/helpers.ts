/**
 * Shared helpers for Supabase Edge Functions.
 *
 * Consolidates common patterns from spec 10_sync_supabase_neo4j.md:
 * - assertPetOwner: ownership verification
 * - createNotification: insert notification row
 * - getOwnerPetIds: get all pet IDs for an owner
 * - distanceLabel: metres → human string
 * - getQueryParams: extract URL search params
 * - computeCompatibility: Neo4j compatibility score
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ForbiddenError } from "./errors.ts";
import { neo4jQuery } from "./neo4j.ts";

/**
 * Assert that the caller (userId) owns the given pet.
 * Throws ForbiddenError if not.
 */
export async function assertPetOwner(
  supabase: SupabaseClient,
  userId: string,
  petId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("pets")
    .select("id")
    .eq("id", petId)
    .eq("owner_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    throw new ForbiddenError("You do not own this pet");
  }
}

/**
 * Insert a notification into the notifications table.
 */
export async function createNotification(
  supabase: SupabaseClient,
  notification: {
    recipient_id: string;
    type: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("notifications").insert(notification);
  if (error) {
    console.error("Failed to create notification:", error);
    // Non-fatal — don't throw
  }
}

/**
 * Get all active pet IDs for a given owner.
 */
export async function getOwnerPetIds(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("pets")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("is_active", true);

  return (data || []).map((p: { id: string }) => p.id);
}

/**
 * Convert distance in metres to a human-friendly label.
 * Raw coordinates are never exposed to the client.
 *
 * See: 08_service_location.md — Distance Label Helper
 */
export function distanceLabel(metres: number): string {
  if (metres < 100) return "Nearby";
  if (metres < 1000) return `~${Math.round(metres / 100) * 100}m away`;
  const km = metres / 1000;
  if (km < 10) return `~${km.toFixed(1)}km away`;
  return `~${Math.round(km)}km away`;
}

/**
 * Extract query parameters from a request URL.
 * Returns a plain object with string values.
 */
export function getQueryParams(req: Request): Record<string, string> {
  const url = new URL(req.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

/**
 * Compute compatibility score (0–100) between two pets via Neo4j.
 *
 * Score breakdown:
 *   - Shared temperament traits: up to 60 points
 *   - Same size: 20 points
 *   - Same species: 10 points
 *   - Both vaccinated: 10 points
 *
 * See: 02_database_schema_neo4j.md — Query 16
 */
export async function computeCompatibility(
  petAId: string,
  petBId: string,
): Promise<number> {
  const results = await neo4jQuery(
    `
    MATCH (me:Pet {id: $a}), (other:Pet {id: $b})
    WITH me, other,
         SIZE([t IN other.temperament WHERE t IN me.temperament]) as shared_traits,
         SIZE(me.temperament) as my_traits
    WITH me, other, shared_traits, my_traits,
         CASE WHEN my_traits > 0 THEN toFloat(shared_traits) / my_traits * 60 ELSE 0 END as trait_score,
         CASE WHEN me.size = other.size THEN 20 ELSE 0 END as size_score,
         CASE WHEN me.species = other.species THEN 10 ELSE 0 END as species_score,
         CASE WHEN me.is_vaccinated AND other.is_vaccinated THEN 10 ELSE 0 END as vacc_score
    RETURN toInteger(trait_score + size_score + species_score + vacc_score) as compatibility_score
    `,
    { a: petAId, b: petBId },
  );

  return (results[0]?.compatibility_score as number) ?? 0;
}

/**
 * Check if two pets are blocked in either direction via Supabase.
 */
export async function checkBlocked(
  supabase: SupabaseClient,
  petAId: string,
  petBId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("pet_relationships")
    .select("id")
    .eq("rel_type", "BLOCKED")
    .or(
      `and(from_pet_id.eq.${petAId},to_pet_id.eq.${petBId}),and(from_pet_id.eq.${petBId},to_pet_id.eq.${petAId})`,
    )
    .maybeSingle();

  return !!data;
}
