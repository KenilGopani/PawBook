import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ValidationError } from "./errors.ts";
import { validateCreatePet, validateLocation, validateUpdateProfile } from "./validation.ts";

Deno.test("validateCreatePet accepts a minimal valid pet", () => {
  const result = validateCreatePet({ name: "Max", species: "dog" });
  assertEquals(result.name, "Max");
  assertEquals(result.species, "dog");
});

Deno.test("validateCreatePet trims the name", () => {
  const result = validateCreatePet({ name: "  Max  ", species: "dog" });
  assertEquals(result.name, "Max");
});

Deno.test("validateCreatePet rejects a missing name", () => {
  assertThrows(() => validateCreatePet({ species: "dog" }), ValidationError);
});

Deno.test("validateCreatePet rejects an unknown species", () => {
  assertThrows(() => validateCreatePet({ name: "Max", species: "dragon" }), ValidationError);
});

Deno.test("validateCreatePet rejects a future dob", () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assertThrows(
    () => validateCreatePet({ name: "Max", species: "dog", dob: future }),
    ValidationError,
  );
});

Deno.test("validateCreatePet rejects an unknown temperament tag", () => {
  assertThrows(
    () => validateCreatePet({ name: "Max", species: "dog", temperament: ["telepathic"] }),
    ValidationError,
  );
});

Deno.test("validateUpdateProfile requires display_name to be 2-50 chars when provided", () => {
  assertThrows(() => validateUpdateProfile({ display_name: "A" }), ValidationError);
  const result = validateUpdateProfile({ display_name: "Alex" });
  assertEquals(result.display_name, "Alex");
});

Deno.test("validateUpdateProfile allows omitting all fields", () => {
  assertEquals(validateUpdateProfile({}), {});
});

Deno.test("validateLocation accepts boundary lat/lng values", () => {
  const result = validateLocation({ lat: 90, lng: -180, city: "Nowhere" });
  assertEquals(result.lat, 90);
  assertEquals(result.lng, -180);
});

Deno.test("validateLocation rejects out-of-range latitude", () => {
  assertThrows(() => validateLocation({ lat: 90.1, lng: 0, city: "X" }), ValidationError);
});

Deno.test("validateLocation rejects out-of-range longitude", () => {
  assertThrows(() => validateLocation({ lat: 0, lng: -180.1, city: "X" }), ValidationError);
});

Deno.test("validateLocation requires a city", () => {
  assertThrows(() => validateLocation({ lat: 0, lng: 0 }), ValidationError);
});
