/**
 * Types mirroring the PawBook Postgres schema
 * (supabase/migrations/*.sql). Kept deliberately close to the
 * column names so a row from the API drops straight in.
 */

export type Species = "dog" | "cat" | "rabbit" | "bird" | "other";
export type Gender = "male" | "female" | "unknown";
export type PetSize = "small" | "medium" | "large" | "xlarge";

export const TEMPERAMENTS = [
  "friendly", "shy", "high-energy", "calm", "dog-selective",
  "cat-friendly", "good-with-kids", "protective", "playful", "independent",
] as const;
export type Temperament = (typeof TEMPERAMENTS)[number];

export const SPECIES_LIST: Species[] = ["dog", "cat", "rabbit", "bird", "other"];
export const SIZE_LIST: PetSize[] = ["small", "medium", "large", "xlarge"];

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Pet {
  id: string;
  owner_id: string;
  name: string;
  species: Species;
  breed: string | null;
  dob: string | null;
  gender: Gender | null;
  bio: string | null;
  avatar_url: string | null;
  temperament: Temperament[];
  size: PetSize | null;
  is_vaccinated: boolean;
  is_active: boolean;
  created_at: string;
  /** Joined/derived, present on discovery responses */
  owner?: Pick<Profile, "display_name" | "city">;
  distance_label?: string;
  compatibility_score?: number;
  match_reasons?: string[];
  mutual_friend_count?: number;
}

export type RelType = "FRIEND_REQ" | "FRIEND" | "BLOCKED";

export interface PetRelationship {
  id: string;
  from_pet_id: string;
  to_pet_id: string;
  rel_type: RelType;
  compatibility: number | null;
  created_at: string;
  from_pet?: Pet;
  to_pet?: Pet;
}

export type MediaType = "photo" | "video" | "text";
export type ReactionType = "PAW" | "BONE" | "HEART";

export interface Post {
  id: string;
  pet_id: string;
  meetup_id: string | null;
  place_id: string | null;
  caption: string | null;
  media_urls: string[];
  media_type: MediaType | null;
  tags: string[];
  like_count: number;
  comment_count: number;
  is_active: boolean;
  created_at: string;
  pet?: Pet;
  place_name?: string | null;
  my_reaction?: ReactionType | null;
}

export interface Comment {
  id: string;
  post_id: string;
  pet_id: string;
  parent_id: string | null;
  body: string;
  is_active: boolean;
  created_at: string;
  pet?: Pet;
}

export type MeetupStatus =
  | "PENDING" | "ACCEPTED" | "SCHEDULED" | "COMPLETED" | "CANCELLED";
export type RsvpStatus = "INVITED" | "ACCEPTED" | "DECLINED";

export interface MeetupParticipant {
  id: string;
  meetup_id: string;
  pet_id: string;
  rsvp_status: RsvpStatus;
  pet?: Pet;
}

export interface Meetup {
  id: string;
  organizer_id: string;
  place_id: string | null;
  title: string;
  description: string | null;
  status: MeetupStatus;
  scheduled_at: string | null;
  max_pets: number;
  is_group: boolean;
  custom_address: string | null;
  created_at: string;
  participants?: MeetupParticipant[];
  place?: Place;
}

export type PlaceType =
  | "park" | "cafe" | "trail" | "beach" | "vet" | "groomer" | "other";

export const PLACE_TYPES: PlaceType[] = [
  "park", "cafe", "trail", "beach", "vet", "groomer", "other",
];

export const PLACE_TAGS = [
  "off-leash", "fenced", "water", "shade", "parking", "indoor",
  "outdoor-seating", "dog-menu", "small-dog-area", "large-dog-area",
  "pet-friendly-staff", "accepts-all-breeds",
] as const;

export interface Place {
  id: string;
  name: string;
  type: PlaceType;
  address: string | null;
  avg_rating: number;
  review_count: number;
  tags: string[];
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  distance_label?: string;
  friends_visited?: number;
  checkins_today?: number;
}

export type AlertType =
  | "DANGEROUS_DOG" | "WILDLIFE" | "THEFT" | "LOST_ITEM" | "OTHER";

export const ALERT_TYPES: AlertType[] = [
  "DANGEROUS_DOG", "WILDLIFE", "THEFT", "LOST_ITEM", "OTHER",
];

export interface LostPetAlert {
  id: string;
  pet_id: string;
  reporter_id: string;
  last_seen_at: string;
  description: string | null;
  contact_info: string;
  photo_url: string | null;
  status: "ACTIVE" | "RESOLVED" | "EXPIRED";
  created_at: string;
  pet?: Pet;
  distance_label?: string;
  sighting_count?: number;
}

export interface CommunityAlert {
  id: string;
  reporter_id: string;
  alert_type: AlertType;
  radius_km: number;
  description: string;
  expires_at: string;
  is_active: boolean;
  created_at: string;
  distance_label?: string;
}

export interface AppNotification {
  id: string;
  recipient_id: string;
  type: string;
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export interface Paginated<T> {
  data: T[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
    limit: number;
  };
}
