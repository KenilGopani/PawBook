/**
 * Demo dataset.
 *
 * The app runs in one of two modes (see api.ts): against a live
 * local Supabase stack, or — when that isn't up — against this
 * in-memory dataset, so the whole UI is explorable before you've
 * installed Docker. Mutations here are real mutations against
 * these arrays, so create/RSVP/react all behave believably.
 */

import type {
  AppNotification, Comment, CommunityAlert, LostPetAlert, Meetup,
  Pet, Place, Post, Profile, PetRelationship,
} from "./types";

export const MOCK_USER_ID = "11111111-1111-1111-1111-111111111111";

export const mockProfile: Profile = {
  id: MOCK_USER_ID,
  display_name: "Kenil G.",
  avatar_url: null,
  bio: "Weekend park regular. Two dogs, zero chill.",
  city: "San Francisco",
  is_active: true,
  created_at: "2026-01-04T10:00:00Z",
};

/** Deterministic emoji avatar per species — no network images needed. */
export const SPECIES_EMOJI: Record<string, string> = {
  dog: "🐕", cat: "🐈", rabbit: "🐇", bird: "🦜", other: "🐾",
};

export const mockPets: Pet[] = [
  {
    id: "pet-1", owner_id: MOCK_USER_ID, name: "Mochi", species: "dog",
    breed: "Shiba Inu", dob: "2022-04-11", gender: "female",
    bio: "Professional zoomie athlete. Will trade sit for cheese.",
    avatar_url: null, temperament: ["high-energy", "playful", "friendly"],
    size: "medium", is_vaccinated: true, is_active: true,
    created_at: "2026-01-04T10:02:00Z",
  },
  {
    id: "pet-2", owner_id: MOCK_USER_ID, name: "Biscuit", species: "dog",
    breed: "Golden Retriever", dob: "2020-09-02", gender: "male",
    bio: "Loves everyone. Has never had a single thought.",
    avatar_url: null, temperament: ["friendly", "calm", "good-with-kids"],
    size: "large", is_vaccinated: true, is_active: true,
    created_at: "2026-01-04T10:04:00Z",
  },
];

export const mockOtherPets: Pet[] = [
  {
    id: "pet-3", owner_id: "u-2", name: "Pepper", species: "dog",
    breed: "Border Collie", dob: "2021-06-20", gender: "female",
    bio: "Herds children. Unpaid.", avatar_url: null,
    temperament: ["high-energy", "protective", "playful"], size: "medium",
    is_vaccinated: true, is_active: true, created_at: "2026-01-06T09:00:00Z",
    owner: { display_name: "Aisha R.", city: "San Francisco" },
    distance_label: "~400m away", compatibility_score: 88,
    match_reasons: ["Shared temperament: high-energy, playful", "Same size", "Both vaccinated"],
    mutual_friend_count: 3,
  },
  {
    id: "pet-4", owner_id: "u-3", name: "Tofu", species: "cat",
    breed: "British Shorthair", dob: "2023-01-15", gender: "male",
    bio: "Tolerates dogs. Barely.", avatar_url: null,
    temperament: ["independent", "calm"], size: "small",
    is_vaccinated: true, is_active: true, created_at: "2026-01-08T14:00:00Z",
    owner: { display_name: "Marco P.", city: "San Francisco" },
    distance_label: "~1.2km away", compatibility_score: 41,
    match_reasons: ["Both vaccinated"], mutual_friend_count: 0,
  },
  {
    id: "pet-5", owner_id: "u-4", name: "Nala", species: "dog",
    breed: "Labrador", dob: "2019-11-30", gender: "female",
    bio: "Swims in anything. Including puddles.", avatar_url: null,
    temperament: ["friendly", "high-energy", "good-with-kids"], size: "large",
    is_vaccinated: true, is_active: true, created_at: "2026-01-09T11:00:00Z",
    owner: { display_name: "Dana K.", city: "San Francisco" },
    distance_label: "Nearby", compatibility_score: 92,
    match_reasons: ["Shared temperament: friendly, high-energy", "Same size", "Both vaccinated"],
    mutual_friend_count: 5,
  },
  {
    id: "pet-6", owner_id: "u-5", name: "Waffles", species: "dog",
    breed: "Corgi", dob: "2022-08-08", gender: "male",
    bio: "Short king. Long body.", avatar_url: null,
    temperament: ["playful", "friendly", "dog-selective"], size: "small",
    is_vaccinated: false, is_active: true, created_at: "2026-01-11T16:00:00Z",
    owner: { display_name: "Sam T.", city: "Oakland" },
    distance_label: "~4.1km away", compatibility_score: 63,
    match_reasons: ["Shared temperament: playful, friendly"], mutual_friend_count: 1,
  },
  {
    id: "pet-7", owner_id: "u-6", name: "Sesame", species: "rabbit",
    breed: "Holland Lop", dob: "2023-05-05", gender: "female",
    bio: "Silent. Judging.", avatar_url: null,
    temperament: ["shy", "calm"], size: "small",
    is_vaccinated: true, is_active: true, created_at: "2026-01-12T08:00:00Z",
    owner: { display_name: "Priya N.", city: "Berkeley" },
    distance_label: "~7km away", compatibility_score: 28,
    match_reasons: ["Both vaccinated"], mutual_friend_count: 0,
  },
];

export const mockRelationships: PetRelationship[] = [
  {
    id: "rel-1", from_pet_id: "pet-5", to_pet_id: "pet-1",
    rel_type: "FRIEND_REQ", compatibility: 92,
    created_at: "2026-08-11T09:12:00Z", from_pet: mockOtherPets[2],
  },
  {
    id: "rel-2", from_pet_id: "pet-1", to_pet_id: "pet-3",
    rel_type: "FRIEND", compatibility: 88,
    created_at: "2026-06-02T09:12:00Z", to_pet: mockOtherPets[0],
  },
  {
    id: "rel-3", from_pet_id: "pet-2", to_pet_id: "pet-6",
    rel_type: "FRIEND", compatibility: 63,
    created_at: "2026-07-19T09:12:00Z", to_pet: mockOtherPets[3],
  },
];

export const mockPlaces: Place[] = [
  {
    id: "place-1", name: "Alamo Square Dog Run", type: "park",
    address: "Steiner St & Hayes St", avg_rating: 4.6, review_count: 128,
    tags: ["off-leash", "fenced", "water", "shade"], is_verified: true,
    is_active: true, created_at: "2025-03-01T00:00:00Z",
    distance_label: "~600m away", friends_visited: 4, checkins_today: 11,
  },
  {
    id: "place-2", name: "Barkley's Pet Café", type: "cafe",
    address: "1042 Valencia St", avg_rating: 4.3, review_count: 64,
    tags: ["indoor", "outdoor-seating", "dog-menu", "pet-friendly-staff"],
    is_verified: true, is_active: true, created_at: "2025-05-14T00:00:00Z",
    distance_label: "~1.8km away", friends_visited: 2, checkins_today: 5,
  },
  {
    id: "place-3", name: "Fort Funston Trail", type: "trail",
    address: "Fort Funston Rd", avg_rating: 4.9, review_count: 302,
    tags: ["off-leash", "water", "parking"], is_verified: true,
    is_active: true, created_at: "2024-11-20T00:00:00Z",
    distance_label: "~8.4km away", friends_visited: 7, checkins_today: 23,
  },
  {
    id: "place-4", name: "Baker Beach", type: "beach",
    address: "Gibson Rd", avg_rating: 4.4, review_count: 89,
    tags: ["off-leash", "water", "parking"], is_verified: false,
    is_active: true, created_at: "2025-07-02T00:00:00Z",
    distance_label: "~5.2km away", friends_visited: 1, checkins_today: 3,
  },
];

export const mockPosts: Post[] = [
  {
    id: "post-1", pet_id: "pet-3", meetup_id: null, place_id: "place-1",
    caption: "Held the ball for 45 minutes. Did not drop it once. Legend behaviour.",
    media_urls: [], media_type: "text", tags: ["park", "goodboy"],
    like_count: 24, comment_count: 3, is_active: true,
    created_at: new Date(Date.now() - 42 * 60_000).toISOString(),
    pet: mockOtherPets[0], place_name: "Alamo Square Dog Run", my_reaction: null,
  },
  {
    id: "post-2", pet_id: "pet-5", meetup_id: null, place_id: "place-3",
    caption: "Fort Funston at golden hour. She swam. I did laundry after.",
    media_urls: [], media_type: "text", tags: ["beach", "zoomies"],
    like_count: 61, comment_count: 8, is_active: true,
    created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    pet: mockOtherPets[2], place_name: "Fort Funston Trail", my_reaction: "HEART",
  },
  {
    id: "post-3", pet_id: "pet-1", meetup_id: null, place_id: null,
    caption: "Mochi discovered the vacuum has an off switch. We are no longer safe.",
    media_urls: [], media_type: "text", tags: [],
    like_count: 12, comment_count: 1, is_active: true,
    created_at: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    pet: mockPets[0], place_name: null, my_reaction: null,
  },
  {
    id: "post-4", pet_id: "pet-6", meetup_id: null, place_id: "place-2",
    caption: "Ordered the puppuccino. Reviewed it. Four stars, would foam again.",
    media_urls: [], media_type: "text", tags: ["cafe"],
    like_count: 38, comment_count: 5, is_active: true,
    created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    pet: mockOtherPets[3], place_name: "Barkley's Pet Café", my_reaction: null,
  },
];

export const mockComments: Record<string, Comment[]> = {
  "post-1": [
    {
      id: "c-1", post_id: "post-1", pet_id: "pet-5", parent_id: null,
      body: "Nala could never. She drops it immediately.",
      is_active: true, created_at: new Date(Date.now() - 30 * 60_000).toISOString(),
      pet: mockOtherPets[2],
    },
    {
      id: "c-2", post_id: "post-1", pet_id: "pet-1", parent_id: null,
      body: "Teach us your ways 🙏", is_active: true,
      created_at: new Date(Date.now() - 12 * 60_000).toISOString(), pet: mockPets[0],
    },
  ],
};

export const mockMeetups: Meetup[] = [
  {
    id: "meet-1", organizer_id: MOCK_USER_ID, place_id: "place-1",
    title: "Saturday morning zoomies", description: "Usual crew, usual chaos. Coffee after.",
    status: "SCHEDULED",
    scheduled_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    max_pets: 8, is_group: true, custom_address: null,
    created_at: "2026-08-09T10:00:00Z", place: mockPlaces[0],
    participants: [
      { id: "mp-1", meetup_id: "meet-1", pet_id: "pet-1", rsvp_status: "ACCEPTED", pet: mockPets[0] },
      { id: "mp-2", meetup_id: "meet-1", pet_id: "pet-3", rsvp_status: "ACCEPTED", pet: mockOtherPets[0] },
      { id: "mp-3", meetup_id: "meet-1", pet_id: "pet-5", rsvp_status: "INVITED", pet: mockOtherPets[2] },
    ],
  },
  {
    id: "meet-2", organizer_id: "u-4", place_id: "place-3",
    title: "Beach day with Nala", description: "Low tide, bring towels.",
    status: "PENDING",
    scheduled_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    max_pets: 4, is_group: false, custom_address: null,
    created_at: "2026-08-10T15:00:00Z", place: mockPlaces[2],
    participants: [
      { id: "mp-4", meetup_id: "meet-2", pet_id: "pet-5", rsvp_status: "ACCEPTED", pet: mockOtherPets[2] },
      { id: "mp-5", meetup_id: "meet-2", pet_id: "pet-2", rsvp_status: "INVITED", pet: mockPets[1] },
    ],
  },
  {
    id: "meet-3", organizer_id: MOCK_USER_ID, place_id: "place-2",
    title: "Café hang", description: "Indoor, calm dogs only.",
    status: "COMPLETED",
    scheduled_at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    max_pets: 4, is_group: false, custom_address: null,
    created_at: "2026-08-01T12:00:00Z", place: mockPlaces[1],
    participants: [
      { id: "mp-6", meetup_id: "meet-3", pet_id: "pet-2", rsvp_status: "ACCEPTED", pet: mockPets[1] },
      { id: "mp-7", meetup_id: "meet-3", pet_id: "pet-6", rsvp_status: "ACCEPTED", pet: mockOtherPets[3] },
    ],
  },
];

export const mockLostPets: LostPetAlert[] = [
  {
    id: "lost-1", pet_id: "pet-7", reporter_id: "u-6",
    last_seen_at: new Date(Date.now() - 5 * 3_600_000).toISOString(),
    description: "Slipped out the back gate during the storm. Very shy, will freeze rather than run. Please don't chase.",
    contact_info: "priya.n@example.com · 555-0142", photo_url: null,
    status: "ACTIVE", created_at: new Date(Date.now() - 4.5 * 3_600_000).toISOString(),
    pet: mockOtherPets[4], distance_label: "~2.1km away", sighting_count: 2,
  },
];

export const mockCommunityAlerts: CommunityAlert[] = [
  {
    id: "ca-1", reporter_id: "u-2", alert_type: "DANGEROUS_DOG",
    radius_km: 2,
    description: "Off-leash dog showing aggression near the north gate of Alamo Square. Owner not present.",
    expires_at: new Date(Date.now() + 3 * 3_600_000).toISOString(),
    is_active: true, created_at: new Date(Date.now() - 55 * 60_000).toISOString(),
    distance_label: "~700m away",
  },
  {
    id: "ca-2", reporter_id: "u-4", alert_type: "WILDLIFE",
    radius_km: 3, description: "Coyote sighting on the Fort Funston trail around dusk. Keep small dogs leashed.",
    expires_at: new Date(Date.now() + 9 * 3_600_000).toISOString(),
    is_active: true, created_at: new Date(Date.now() - 4 * 3_600_000).toISOString(),
    distance_label: "~8.4km away",
  },
];

export const mockNotifications: AppNotification[] = [
  {
    id: "n-1", recipient_id: MOCK_USER_ID, type: "FRIEND_REQUEST",
    payload: { from_pet_name: "Nala", from_pet_id: "pet-5" }, is_read: false,
    created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  },
  {
    id: "n-2", recipient_id: MOCK_USER_ID, type: "COMMUNITY_ALERT",
    payload: { description: "Dangerous dog reported nearby" }, is_read: false,
    created_at: new Date(Date.now() - 55 * 60_000).toISOString(),
  },
  {
    id: "n-3", recipient_id: MOCK_USER_ID, type: "MEETUP_RSVP",
    payload: { pet_name: "Pepper", meetup_title: "Saturday morning zoomies" },
    is_read: true, created_at: new Date(Date.now() - 20 * 3_600_000).toISOString(),
  },
  {
    id: "n-4", recipient_id: MOCK_USER_ID, type: "LOST_PET_NEARBY",
    payload: { pet_name: "Sesame" }, is_read: true,
    created_at: new Date(Date.now() - 4.5 * 3_600_000).toISOString(),
  },
];
