/**
 * Thin client over the PawBook Edge Functions.
 *
 * Every exported function here maps 1:1 to a real function under
 * supabase/functions/. Two things happen on each call:
 *
 *   1. it's recorded in the API log (powers the Inspector panel)
 *   2. if no live Supabase is configured, it falls through to the
 *      demo dataset in mock.ts — so the UI is fully explorable
 *      before the backend stack is running.
 *
 * The five endpoints the backend treats as idempotent
 * (11_api_conventions.md) send an Idempotency-Key header here,
 * matching supabase/functions/_shared/idempotency.ts.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { endCall, startCall } from "./apiLog";
import * as M from "./mock";
import type {
  AppNotification, Comment, CommunityAlert, LostPetAlert, Meetup, Pet,
  PetRelationship, Place, Post, Profile, ReactionType, RsvpStatus,
} from "./types";

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isLive = Boolean(URL_ && KEY_);

export const supabase: SupabaseClient | null = isLive
  ? createClient(URL_!, KEY_!)
  : null;

/** Endpoints that accept an Idempotency-Key (see 11_api_conventions.md). */
const IDEMPOTENT = new Set([
  "create-post", "create-meetup", "send-friend-request",
  "create-lost-pet-alert", "create-community-alert",
]);

interface CallOpts<T> {
  fn: string;
  area: string;
  method?: string;
  body?: unknown;
  /** Backend side-effects to surface in the Inspector. */
  effects?: string[];
  /** Demo-mode implementation. */
  mock: () => T | Promise<T>;
}

async function call<T>({
  fn, area, method = "POST", body, effects, mock,
}: CallOpts<T>): Promise<T> {
  const id = startCall(fn, method, area, effects);
  const t0 = performance.now();

  // Demo mode — resolve from the in-memory dataset.
  if (!supabase) {
    const out = await Promise.resolve(mock());
    // A touch of latency so loading states are visible & honest.
    await new Promise((r) => setTimeout(r, 130 + Math.random() * 160));
    endCall(id, "mock", Math.round(performance.now() - t0), "demo data");
    return out;
  }

  try {
    const headers: Record<string, string> = {};
    if (IDEMPOTENT.has(fn)) headers["Idempotency-Key"] = crypto.randomUUID();

    const { data, error } = await supabase.functions.invoke(fn, {
      body: body ?? {},
      headers,
    });
    if (error) throw error;
    endCall(id, "ok", Math.round(performance.now() - t0));
    return data as T;
  } catch (e) {
    endCall(
      id, "error", Math.round(performance.now() - t0),
      e instanceof Error ? e.message : String(e),
    );
    throw e;
  }
}

/* ── Profile & pets — 04_service_user_pet.md ─────────────── */

export const getProfile = () =>
  call<Profile>({
    fn: "profile (SDK)", area: "User & Pet", method: "GET",
    mock: () => M.mockProfile,
  });

export const getMyPets = () =>
  call<Pet[]>({
    fn: "pets (SDK)", area: "User & Pet", method: "GET",
    mock: () => M.mockPets,
  });

export const createPet = (body: Partial<Pet>) =>
  call<Pet>({
    fn: "create-pet", area: "User & Pet", body,
    effects: ["Postgres: insert pets", "Neo4j: MERGE (:Pet) + (:Owner)-[:OWNS]->"],
    mock: () => {
      const pet: Pet = {
        id: `pet-${Date.now()}`, owner_id: M.MOCK_USER_ID,
        name: body.name ?? "New pet", species: body.species ?? "dog",
        breed: body.breed ?? null, dob: body.dob ?? null,
        gender: body.gender ?? "unknown", bio: body.bio ?? null,
        avatar_url: null, temperament: body.temperament ?? [],
        size: body.size ?? "medium", is_vaccinated: body.is_vaccinated ?? false,
        is_active: true, created_at: new Date().toISOString(),
      };
      M.mockPets.push(pet);
      return pet;
    },
  });

export const updatePet = (id: string, body: Partial<Pet>) =>
  call<Pet>({
    fn: "update-pet", area: "User & Pet", method: "PATCH", body: { id, ...body },
    effects: ["Postgres: update pets", "DB trigger → sync-pet-update → Neo4j"],
    mock: () => {
      const p = M.mockPets.find((x) => x.id === id);
      if (p) Object.assign(p, body);
      return p!;
    },
  });

export const deletePet = (id: string) =>
  call<{ success: true }>({
    fn: "delete-pet", area: "User & Pet", method: "DELETE", body: { id },
    effects: ["Postgres: soft-delete (is_active=false)", "trigger → sync-pet-update"],
    mock: () => {
      const i = M.mockPets.findIndex((x) => x.id === id);
      if (i >= 0) M.mockPets.splice(i, 1);
      return { success: true as const };
    },
  });

export const searchPets = (q: string) =>
  call<Pet[]>({
    fn: "search-pets", area: "User & Pet", method: "GET", body: { q },
    mock: () =>
      [...M.mockPets, ...M.mockOtherPets].filter(
        (p) =>
          p.name.toLowerCase().includes(q.toLowerCase()) ||
          (p.breed ?? "").toLowerCase().includes(q.toLowerCase()),
      ),
  });

export const updateLocation = (lat: number, lng: number, city: string) =>
  call<{ success: true }>({
    fn: "update-location", area: "Location", body: { lat, lng, city },
    effects: ["Postgres: profiles.location (PostGIS)", "Neo4j: SET o.lat/lng + owned pets"],
    mock: () => ({ success: true as const }),
  });

/* ── Social graph — 05_service_social_graph.md ───────────── */

export const discoverNearby = () =>
  call<Pet[]>({
    fn: "discover-nearby", area: "Social Graph", method: "GET",
    effects: ["Neo4j: geo + graph traversal"],
    mock: () => M.mockOtherPets,
  });

export const discoverSuggested = () =>
  call<Pet[]>({
    fn: "discover-suggested", area: "Social Graph", method: "GET",
    effects: ["Neo4j: friend-of-friend traversal"],
    mock: () => M.mockOtherPets.filter((p) => (p.mutual_friend_count ?? 0) > 0),
  });

export const discoverCompatible = () =>
  call<Pet[]>({
    fn: "discover-compatible", area: "Social Graph", method: "GET",
    effects: ["Neo4j: computeCompatibility() scoring"],
    mock: () =>
      [...M.mockOtherPets].sort(
        (a, b) => (b.compatibility_score ?? 0) - (a.compatibility_score ?? 0),
      ),
  });

export const getRelationships = () =>
  call<PetRelationship[]>({
    fn: "pet_relationships (SDK)", area: "Social Graph", method: "GET",
    mock: () => M.mockRelationships,
  });

export const sendFriendRequest = (from_pet_id: string, to_pet_id: string) =>
  call<PetRelationship>({
    fn: "send-friend-request", area: "Social Graph",
    body: { from_pet_id, to_pet_id },
    effects: [
      "Idempotency-Key sent",
      "Postgres: pet_relationships FRIEND_REQ",
      "Neo4j: MERGE (a)-[:SENT_REQUEST_TO]->(b)",
      "notifications row → recipient",
    ],
    mock: () => {
      const rel: PetRelationship = {
        id: `rel-${Date.now()}`, from_pet_id, to_pet_id,
        rel_type: "FRIEND_REQ", compatibility: null,
        created_at: new Date().toISOString(),
        to_pet: M.mockOtherPets.find((p) => p.id === to_pet_id),
      };
      M.mockRelationships.push(rel);
      return rel;
    },
  });

export const acceptFriendRequest = (relId: string) =>
  call<{ success: true }>({
    fn: "accept-friend-request", area: "Social Graph", body: { id: relId },
    effects: [
      "Postgres: rel_type → FRIEND",
      "Neo4j: DELETE SENT_REQUEST_TO, MERGE FRIENDS_WITH (both directions)",
    ],
    mock: () => {
      const r = M.mockRelationships.find((x) => x.id === relId);
      if (r) r.rel_type = "FRIEND";
      return { success: true as const };
    },
  });

export const declineFriendRequest = (relId: string) =>
  call<{ success: true }>({
    fn: "decline-friend-request", area: "Social Graph", body: { id: relId },
    effects: ["Postgres: DELETE row", "trigger → sync-relationship-delete → Neo4j"],
    mock: () => {
      const i = M.mockRelationships.findIndex((x) => x.id === relId);
      if (i >= 0) M.mockRelationships.splice(i, 1);
      return { success: true as const };
    },
  });

export const blockPet = (from_pet_id: string, to_pet_id: string) =>
  call<{ success: true }>({
    fn: "block-pet", area: "Social Graph", body: { from_pet_id, to_pet_id },
    effects: [
      "Postgres: rel_type → BLOCKED (enforced immediately, not eventually)",
      "Neo4j: DELETE FRIENDS_WITH, MERGE BLOCKED",
    ],
    mock: () => {
      const r = M.mockRelationships.find(
        (x) => x.from_pet_id === from_pet_id && x.to_pet_id === to_pet_id,
      );
      if (r) r.rel_type = "BLOCKED";
      return { success: true as const };
    },
  });

export const getMutualFriends = (petId: string, otherId: string) =>
  call<Pet[]>({
    fn: "mutual-friends", area: "Social Graph", method: "GET",
    body: { pet_id: petId, other_pet_id: otherId },
    effects: ["Neo4j: mutual FRIENDS_WITH intersection"],
    mock: () => M.mockOtherPets.slice(0, 3),
  });

/* ── Feed — 06_service_feed.md ───────────────────────────── */

export const getFeed = () =>
  call<Post[]>({
    fn: "get-feed", area: "Feed", method: "GET",
    effects: ["Neo4j: friend pet ids", "Postgres: posts by those pets"],
    mock: () => [...M.mockPosts].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  });

export const getExplore = () =>
  call<Post[]>({
    fn: "get-explore", area: "Feed", method: "GET",
    mock: () => [...M.mockPosts].sort((a, b) => b.like_count - a.like_count),
  });

export const createPost = (body: {
  pet_id: string; caption: string; tags: string[]; place_id?: string | null;
}) =>
  call<Post>({
    fn: "create-post", area: "Feed", body,
    effects: [
      "Idempotency-Key sent",
      "Postgres: insert posts",
      "Neo4j: MERGE (:Pet)-[:VISITED]->(:Place) if place tagged",
    ],
    mock: () => {
      const pet = [...M.mockPets, ...M.mockOtherPets].find((p) => p.id === body.pet_id);
      const post: Post = {
        id: `post-${Date.now()}`, pet_id: body.pet_id, meetup_id: null,
        place_id: body.place_id ?? null, caption: body.caption,
        media_urls: [], media_type: "text", tags: body.tags,
        like_count: 0, comment_count: 0, is_active: true,
        created_at: new Date().toISOString(), pet,
        place_name: M.mockPlaces.find((p) => p.id === body.place_id)?.name ?? null,
        my_reaction: null,
      };
      M.mockPosts.unshift(post);
      return post;
    },
  });

export const reactToPost = (post_id: string, reaction_type: ReactionType) =>
  call<{ success: true }>({
    fn: "react-to-post", area: "Feed", body: { post_id, reaction_type },
    effects: ["Postgres: post_reactions upsert", "DB trigger maintains posts.like_count"],
    mock: () => {
      const p = M.mockPosts.find((x) => x.id === post_id);
      if (p) {
        if (p.my_reaction === reaction_type) {
          p.my_reaction = null;
          p.like_count = Math.max(0, p.like_count - 1);
        } else {
          if (!p.my_reaction) p.like_count += 1;
          p.my_reaction = reaction_type;
        }
      }
      return { success: true as const };
    },
  });

export const getComments = (postId: string) =>
  call<Comment[]>({
    fn: "comments (SDK)", area: "Feed", method: "GET", body: { post_id: postId },
    mock: () => M.mockComments[postId] ?? [],
  });

export const addComment = (post_id: string, pet_id: string, body_: string) =>
  call<Comment>({
    fn: "add-comment", area: "Feed", body: { post_id, pet_id, body: body_ },
    effects: ["Postgres: insert comments", "trigger maintains posts.comment_count", "notification → post owner"],
    mock: () => {
      const c: Comment = {
        id: `c-${Date.now()}`, post_id, pet_id, parent_id: null,
        body: body_, is_active: true, created_at: new Date().toISOString(),
        pet: [...M.mockPets, ...M.mockOtherPets].find((p) => p.id === pet_id),
      };
      M.mockComments[post_id] = [...(M.mockComments[post_id] ?? []), c];
      const p = M.mockPosts.find((x) => x.id === post_id);
      if (p) p.comment_count += 1;
      return c;
    },
  });

/* ── Meetups — 07_service_meetup.md ──────────────────────── */

export const getMeetups = () =>
  call<Meetup[]>({
    fn: "meetups (SDK)", area: "Meetup", method: "GET",
    mock: () => M.mockMeetups,
  });

export const createMeetup = (body: {
  title: string; description: string; organizer_pet_id: string;
  invited_pet_ids: string[]; place_id?: string | null;
  scheduled_at?: string | null; is_group: boolean; max_pets: number;
}) =>
  call<Meetup>({
    fn: "create-meetup", area: "Meetup", body,
    effects: [
      "Idempotency-Key sent",
      "Postgres: meetups + meetup_participants",
      "notifications → every invitee",
    ],
    mock: () => {
      const m: Meetup = {
        id: `meet-${Date.now()}`, organizer_id: M.MOCK_USER_ID,
        place_id: body.place_id ?? null, title: body.title,
        description: body.description, status: "PENDING",
        scheduled_at: body.scheduled_at ?? null, max_pets: body.max_pets,
        is_group: body.is_group, custom_address: null,
        created_at: new Date().toISOString(),
        place: M.mockPlaces.find((p) => p.id === body.place_id),
        participants: [
          {
            id: `mp-${Date.now()}`, meetup_id: "x", pet_id: body.organizer_pet_id,
            rsvp_status: "ACCEPTED",
            pet: M.mockPets.find((p) => p.id === body.organizer_pet_id),
          },
          ...body.invited_pet_ids.map((pid, i) => ({
            id: `mp-${Date.now()}-${i}`, meetup_id: "x", pet_id: pid,
            rsvp_status: "INVITED" as RsvpStatus,
            pet: M.mockOtherPets.find((p) => p.id === pid),
          })),
        ],
      };
      M.mockMeetups.unshift(m);
      return m;
    },
  });

export const rsvpMeetup = (
  meetup_id: string, pet_id: string, rsvp_status: "ACCEPTED" | "DECLINED",
) =>
  call<{ success: true }>({
    fn: "rsvp-meetup", area: "Meetup", body: { meetup_id, pet_id, rsvp_status },
    effects: ["Postgres: meetup_participants.rsvp_status", "notification → organizer"],
    mock: () => {
      const m = M.mockMeetups.find((x) => x.id === meetup_id);
      const p = m?.participants?.find((x) => x.pet_id === pet_id);
      if (p) p.rsvp_status = rsvp_status;
      if (m && rsvp_status === "ACCEPTED" && m.status === "PENDING") m.status = "ACCEPTED";
      return { success: true as const };
    },
  });

export const scheduleMeetup = (meetup_id: string, scheduled_at: string) =>
  call<{ success: true }>({
    fn: "schedule-meetup", area: "Meetup", method: "PATCH",
    body: { meetup_id, scheduled_at },
    effects: ["Postgres: status → SCHEDULED", "notifications → participants"],
    mock: () => {
      const m = M.mockMeetups.find((x) => x.id === meetup_id);
      if (m) { m.scheduled_at = scheduled_at; m.status = "SCHEDULED"; }
      return { success: true as const };
    },
  });

export const cancelMeetup = (meetup_id: string) =>
  call<{ success: true }>({
    fn: "cancel-meetup", area: "Meetup", method: "PATCH", body: { meetup_id },
    effects: ["Postgres: status → CANCELLED", "blocked within 2h of start (TOO_LATE_TO_CANCEL)"],
    mock: () => {
      const m = M.mockMeetups.find((x) => x.id === meetup_id);
      if (m) m.status = "CANCELLED";
      return { success: true as const };
    },
  });

export const completeMeetup = (meetup_id: string) =>
  call<{ success: true }>({
    fn: "complete-meetup", area: "Meetup", body: { meetup_id },
    effects: [
      "Postgres: status → COMPLETED",
      "Neo4j: MERGE VISITED + MET_AT for every participant",
      "also run automatically by pg_cron every 15 min",
    ],
    mock: () => {
      const m = M.mockMeetups.find((x) => x.id === meetup_id);
      if (m) m.status = "COMPLETED";
      return { success: true as const };
    },
  });

export const submitMeetupReview = (
  meetup_id: string, rating: number, body_: string,
) =>
  call<{ success: true }>({
    fn: "submit-meetup-review", area: "Meetup",
    body: { meetup_id, rating, body: body_ },
    effects: ["Postgres: meetup_reviews", "Neo4j: update FRIENDS_WITH.compatibility"],
    mock: () => ({ success: true as const }),
  });

/* ── Places — 08_service_location.md ─────────────────────── */

export const getPlacesNearby = () =>
  call<Place[]>({
    fn: "places-nearby", area: "Location", method: "GET",
    effects: ["Postgres: PostGIS ST_DWithin", "Neo4j: friend social proof"],
    mock: () => M.mockPlaces,
  });

export const searchPlaces = (q: string) =>
  call<Place[]>({
    fn: "search-places", area: "Location", method: "GET", body: { q },
    mock: () =>
      M.mockPlaces.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
  });

export const createPlace = (body: {
  name: string; type: string; tags: string[]; address: string;
}) =>
  call<Place>({
    fn: "create-place", area: "Location", body,
    effects: ["Postgres: insert places", "Neo4j: MERGE (:Place)"],
    mock: () => {
      const pl: Place = {
        id: `place-${Date.now()}`, name: body.name,
        type: body.type as Place["type"], address: body.address,
        avg_rating: 0, review_count: 0, tags: body.tags,
        is_verified: false, is_active: true,
        created_at: new Date().toISOString(),
        distance_label: "Nearby", friends_visited: 0, checkins_today: 0,
      };
      M.mockPlaces.unshift(pl);
      return pl;
    },
  });

export const reviewPlace = (place_id: string, rating: number, body_: string) =>
  call<{ success: true }>({
    fn: "review-place", area: "Location", body: { place_id, rating, body: body_ },
    effects: ["Postgres: place_reviews", "trigger recomputes places.avg_rating"],
    mock: () => {
      const p = M.mockPlaces.find((x) => x.id === place_id);
      if (p) {
        p.avg_rating = Number(
          ((p.avg_rating * p.review_count + rating) / (p.review_count + 1)).toFixed(2),
        );
        p.review_count += 1;
      }
      return { success: true as const };
    },
  });

export const getPlaceSocialProof = (place_id: string) =>
  call<{ friends: Pet[]; checkins_today: number }>({
    fn: "place-social-proof", area: "Location", method: "GET", body: { place_id },
    effects: ["Neo4j: which of my friends VISITED this place"],
    mock: () => ({
      friends: M.mockOtherPets.slice(0, 3),
      checkins_today:
        M.mockPlaces.find((p) => p.id === place_id)?.checkins_today ?? 0,
    }),
  });

export const getNearbyPets = () =>
  call<Pet[]>({
    fn: "nearby-pets", area: "Location", method: "GET",
    effects: ["Postgres: PostGIS radius over profiles.location"],
    mock: () => M.mockOtherPets,
  });

/* ── Alerts & safety — 09_service_alerts.md ──────────────── */

export const getLostPetsNearby = () =>
  call<LostPetAlert[]>({
    fn: "lost-pets-nearby", area: "Alerts", method: "GET",
    mock: () => M.mockLostPets,
  });

export const createLostPetAlert = (body: {
  pet_id: string; description: string; contact_info: string;
  notify_radius_km: number;
}) =>
  call<LostPetAlert>({
    fn: "create-lost-pet-alert", area: "Alerts", body,
    effects: [
      "Idempotency-Key sent",
      "Postgres: lost_pet_alerts",
      "RPC users_within_radius (PostGIS)",
      "notifications batch-insert",
      "APNs push → every nearby device",
    ],
    mock: () => {
      const a: LostPetAlert = {
        id: `lost-${Date.now()}`, pet_id: body.pet_id,
        reporter_id: M.MOCK_USER_ID, last_seen_at: new Date().toISOString(),
        description: body.description, contact_info: body.contact_info,
        photo_url: null, status: "ACTIVE", created_at: new Date().toISOString(),
        pet: M.mockPets.find((p) => p.id === body.pet_id),
        distance_label: "Nearby", sighting_count: 0,
      };
      M.mockLostPets.unshift(a);
      return a;
    },
  });

export const reportSighting = (alert_id: string, note: string) =>
  call<{ success: true }>({
    fn: "report-sighting", area: "Alerts", body: { alert_id, note },
    effects: ["Postgres: sightings", "notification → reporter"],
    mock: () => {
      const a = M.mockLostPets.find((x) => x.id === alert_id);
      if (a) a.sighting_count = (a.sighting_count ?? 0) + 1;
      return { success: true as const };
    },
  });

export const getCommunityAlerts = () =>
  call<CommunityAlert[]>({
    fn: "community-alerts-nearby", area: "Alerts", method: "GET",
    mock: () => M.mockCommunityAlerts.filter((a) => a.is_active),
  });

export const createCommunityAlert = (body: {
  alert_type: string; description: string; radius_km: number; expires_hours: number;
}) =>
  call<CommunityAlert>({
    fn: "create-community-alert", area: "Alerts", body,
    effects: [
      "Idempotency-Key sent",
      "rate limit: 3 per 24h per user",
      "RPC users_within_radius (PostGIS)",
      "APNs push → every nearby device",
    ],
    mock: () => {
      const a: CommunityAlert = {
        id: `ca-${Date.now()}`, reporter_id: M.MOCK_USER_ID,
        alert_type: body.alert_type as CommunityAlert["alert_type"],
        radius_km: body.radius_km, description: body.description,
        expires_at: new Date(Date.now() + body.expires_hours * 3_600_000).toISOString(),
        is_active: true, created_at: new Date().toISOString(),
        distance_label: "Nearby",
      };
      M.mockCommunityAlerts.unshift(a);
      return a;
    },
  });

export const submitReport = (body: {
  target_type: string; target_id: string; reason: string; note: string;
}) =>
  call<{ success: true }>({
    fn: "submit-report", area: "Alerts", body,
    effects: ["Postgres: reports", "rate limit: 10/hour"],
    mock: () => ({ success: true as const }),
  });

/* ── Notifications & push ────────────────────────────────── */

export const getNotifications = () =>
  call<AppNotification[]>({
    fn: "notifications (SDK + Realtime)", area: "Notifications", method: "GET",
    mock: () => M.mockNotifications,
  });

export const registerDeviceToken = (device_token: string) =>
  call<{ success: true }>({
    fn: "register-device-token", area: "Notifications", body: { device_token },
    effects: ["Postgres: upsert device_push_tokens", "enables APNs delivery"],
    mock: () => ({ success: true as const }),
  });

export const neo4jHealth = () =>
  call<{ neo4j: string }>({
    fn: "neo4j-health", area: "Health", method: "GET",
    effects: ["pinged by pg_cron every 5 min"],
    mock: () => ({ neo4j: "healthy (demo)" }),
  });
