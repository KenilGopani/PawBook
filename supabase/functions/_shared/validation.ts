/**
 * Input validation helpers for Edge Functions.
 *
 * Validation rules come from 04_service_user_pet.md.
 */

import { ValidationError } from "./errors.ts";

// ─── Allowed Values ───────────────────────────────────────

export const ALLOWED_SPECIES = ["dog", "cat", "rabbit", "bird", "other"] as const;
export const ALLOWED_GENDERS = ["male", "female", "unknown"] as const;
export const ALLOWED_SIZES = ["small", "medium", "large", "xlarge"] as const;
export const ALLOWED_TEMPERAMENTS = [
  "friendly",
  "shy",
  "high-energy",
  "calm",
  "dog-selective",
  "cat-friendly",
  "good-with-kids",
  "protective",
  "playful",
  "independent",
] as const;

export const ALLOWED_PLACE_TYPES = [
  "park",
  "cafe",
  "trail",
  "beach",
  "vet",
  "groomer",
  "other",
] as const;

export const ALLOWED_REACTION_TYPES = ["PAW", "BONE", "HEART"] as const;

// ─── Specs 06–09 Enums ───────────────────────────────────

export const ALLOWED_ALERT_TYPES = [
  "DANGEROUS_DOG",
  "WILDLIFE",
  "THEFT",
  "LOST_ITEM",
  "OTHER",
] as const;

export const ALLOWED_REPORT_REASONS = [
  "INAPPROPRIATE_CONTENT",
  "SPAM",
  "HARASSMENT",
  "FAKE_PROFILE",
  "ANIMAL_ABUSE",
  "DANGEROUS_CONTENT",
  "OTHER",
] as const;

export const ALLOWED_REPORT_TARGETS = [
  "profile",
  "pet",
  "post",
  "comment",
  "place",
] as const;

export const ALLOWED_PLACE_TAGS = [
  "off-leash",
  "fenced",
  "water",
  "shade",
  "parking",
  "indoor",
  "outdoor-seating",
  "dog-menu",
  "small-dog-area",
  "large-dog-area",
  "pet-friendly-staff",
  "accepts-all-breeds",
] as const;

export const ALLOWED_MEDIA_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "video/mp4",
  "video/mov",
] as const;

export const ALLOWED_POST_MEDIA_TYPES = ["photo", "video"] as const;

export const ALLOWED_RSVP_STATUSES = ["ACCEPTED", "DECLINED"] as const;

// ─── Pet Validation ───────────────────────────────────────

export interface CreatePetInput {
  name: string;
  species: string;
  breed?: string;
  dob?: string;
  gender?: string;
  bio?: string;
  temperament?: string[];
  size?: string;
}

export function validateCreatePet(body: Record<string, unknown>): CreatePetInput {
  // name — required, 1–50 chars
  if (!body.name || typeof body.name !== "string") {
    throw new ValidationError("name is required", "name");
  }
  const name = body.name.trim();
  if (name.length < 1 || name.length > 50) {
    throw new ValidationError("name must be 1–50 characters", "name");
  }

  // species — required, must be in allowed list
  if (!body.species || typeof body.species !== "string") {
    throw new ValidationError("species is required", "species");
  }
  if (!ALLOWED_SPECIES.includes(body.species as typeof ALLOWED_SPECIES[number])) {
    throw new ValidationError(
      `species must be one of: ${ALLOWED_SPECIES.join(", ")}`,
      "species",
    );
  }

  // breed — optional, max 100 chars
  if (body.breed !== undefined) {
    if (typeof body.breed !== "string" || body.breed.length > 100) {
      throw new ValidationError("breed must be a string, max 100 characters", "breed");
    }
  }

  // dob — optional, must be in the past, max 30 years ago
  if (body.dob !== undefined) {
    if (typeof body.dob !== "string") {
      throw new ValidationError("dob must be a date string (YYYY-MM-DD)", "dob");
    }
    const dobDate = new Date(body.dob);
    if (isNaN(dobDate.getTime())) {
      throw new ValidationError("dob must be a valid date (YYYY-MM-DD)", "dob");
    }
    if (dobDate > new Date()) {
      throw new ValidationError("dob must be in the past", "dob");
    }
    const thirtyYearsAgo = new Date();
    thirtyYearsAgo.setFullYear(thirtyYearsAgo.getFullYear() - 30);
    if (dobDate < thirtyYearsAgo) {
      throw new ValidationError("dob cannot be more than 30 years ago", "dob");
    }
  }

  // gender — optional, must be in allowed list
  if (body.gender !== undefined) {
    if (!ALLOWED_GENDERS.includes(body.gender as typeof ALLOWED_GENDERS[number])) {
      throw new ValidationError(
        `gender must be one of: ${ALLOWED_GENDERS.join(", ")}`,
        "gender",
      );
    }
  }

  // bio — optional, max 300 chars
  if (body.bio !== undefined) {
    if (typeof body.bio !== "string" || body.bio.length > 300) {
      throw new ValidationError("bio must be a string, max 300 characters", "bio");
    }
  }

  // temperament — optional, array of allowed values
  if (body.temperament !== undefined) {
    if (!Array.isArray(body.temperament)) {
      throw new ValidationError("temperament must be an array", "temperament");
    }
    for (const t of body.temperament) {
      if (!ALLOWED_TEMPERAMENTS.includes(t as typeof ALLOWED_TEMPERAMENTS[number])) {
        throw new ValidationError(
          `Invalid temperament "${t}". Allowed: ${ALLOWED_TEMPERAMENTS.join(", ")}`,
          "temperament",
        );
      }
    }
  }

  // size — optional, must be in allowed list
  if (body.size !== undefined) {
    if (!ALLOWED_SIZES.includes(body.size as typeof ALLOWED_SIZES[number])) {
      throw new ValidationError(
        `size must be one of: ${ALLOWED_SIZES.join(", ")}`,
        "size",
      );
    }
  }

  return {
    name,
    species: body.species as string,
    breed: body.breed as string | undefined,
    dob: body.dob as string | undefined,
    gender: body.gender as string | undefined,
    bio: body.bio as string | undefined,
    temperament: body.temperament as string[] | undefined,
    size: body.size as string | undefined,
  };
}

// ─── Profile Validation ──────────────────────────────────

export interface UpdateProfileInput {
  display_name?: string;
  bio?: string;
  city?: string;
}

export function validateUpdateProfile(
  body: Record<string, unknown>,
): UpdateProfileInput {
  const result: UpdateProfileInput = {};

  if (body.display_name !== undefined) {
    if (typeof body.display_name !== "string") {
      throw new ValidationError("display_name must be a string", "display_name");
    }
    const name = body.display_name.trim();
    if (name.length < 2 || name.length > 50) {
      throw new ValidationError(
        "display_name must be 2–50 characters",
        "display_name",
      );
    }
    result.display_name = name;
  }

  if (body.bio !== undefined) {
    if (typeof body.bio !== "string" || body.bio.length > 200) {
      throw new ValidationError("bio must be a string, max 200 characters", "bio");
    }
    result.bio = body.bio;
  }

  if (body.city !== undefined) {
    if (typeof body.city !== "string" || body.city.length > 100) {
      throw new ValidationError("city must be a string, max 100 characters", "city");
    }
    result.city = body.city;
  }

  return result;
}

// ─── Location Validation ─────────────────────────────────

export interface LocationInput {
  lat: number;
  lng: number;
  city: string;
}

export function validateLocation(body: Record<string, unknown>): LocationInput {
  if (typeof body.lat !== "number" || body.lat < -90 || body.lat > 90) {
    throw new ValidationError("lat must be a number between -90 and 90", "lat");
  }
  if (typeof body.lng !== "number" || body.lng < -180 || body.lng > 180) {
    throw new ValidationError("lng must be a number between -180 and 180", "lng");
  }
  if (!body.city || typeof body.city !== "string") {
    throw new ValidationError("city is required", "city");
  }

  return {
    lat: body.lat,
    lng: body.lng,
    city: body.city.trim(),
  };
}

// ─── File Validation ─────────────────────────────────────

const IMAGE_TYPES = ["image/jpeg", "image/png"];
const DOC_TYPES = [...IMAGE_TYPES, "application/pdf"];

export function validateImageFile(
  file: File,
  maxSizeMB = 5,
): void {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new ValidationError(
      `Only JPEG and PNG allowed, got ${file.type}`,
      "file",
    );
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    throw new ValidationError(
      `File too large. Maximum ${maxSizeMB}MB`,
      "file",
    );
  }
}

export function validateDocFile(
  file: File,
  maxSizeMB = 10,
): void {
  if (!DOC_TYPES.includes(file.type)) {
    throw new ValidationError(
      `Only JPEG, PNG, and PDF allowed, got ${file.type}`,
      "file",
    );
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    throw new ValidationError(
      `File too large. Maximum ${maxSizeMB}MB`,
      "file",
    );
  }
}
