/**
 * Edge Function: update-pet
 *
 * Update a pet's profile fields. Syncs changed fields to Neo4j.
 *
 * PATCH /functions/v1/update-pet
 * Body: { pet_id: string, ...fields to update }
 *
 * See: 04_service_user_pet.md — PATCH /pets/:id
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import {
  errorResponse,
  ForbiddenError,
  NotFoundError,
  ok,
  ValidationError,
} from "../_shared/errors.ts";
import {
  ALLOWED_GENDERS,
  ALLOWED_SIZES,
  ALLOWED_SPECIES,
  ALLOWED_TEMPERAMENTS,
} from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const body = await req.json();

    const petId = body.pet_id;
    if (!petId) {
      throw new ValidationError("pet_id is required", "pet_id");
    }

    // 1. Verify caller owns the pet
    const { data: existingPet, error: fetchError } = await supabase
      .from("pets")
      .select("id, owner_id")
      .eq("id", petId)
      .eq("is_active", true)
      .single();

    if (fetchError || !existingPet) {
      throw new NotFoundError("Pet not found");
    }

    if (existingPet.owner_id !== user.id) {
      throw new ForbiddenError("You do not own this pet");
    }

    // 2. Build update object (only provided fields)
    const updateFields: Record<string, unknown> = {};
    const neo4jFields: Record<string, unknown> = { pet_id: petId };

    if (body.name !== undefined) {
      if (
        typeof body.name !== "string" || body.name.trim().length < 1 || body.name.trim().length > 50
      ) {
        throw new ValidationError("name must be 1–50 characters", "name");
      }
      updateFields.name = body.name.trim();
      neo4jFields.name = body.name.trim();
    }

    if (body.species !== undefined) {
      if (!ALLOWED_SPECIES.includes(body.species)) {
        throw new ValidationError(
          `species must be one of: ${ALLOWED_SPECIES.join(", ")}`,
          "species",
        );
      }
      updateFields.species = body.species;
      neo4jFields.species = body.species;
    }

    if (body.breed !== undefined) {
      updateFields.breed = body.breed;
      neo4jFields.breed = body.breed || "";
    }

    if (body.dob !== undefined) {
      updateFields.dob = body.dob;
    }

    if (body.gender !== undefined) {
      if (!ALLOWED_GENDERS.includes(body.gender)) {
        throw new ValidationError(`gender must be one of: ${ALLOWED_GENDERS.join(", ")}`, "gender");
      }
      updateFields.gender = body.gender;
    }

    if (body.bio !== undefined) {
      if (typeof body.bio === "string" && body.bio.length > 300) {
        throw new ValidationError("bio must be max 300 characters", "bio");
      }
      updateFields.bio = body.bio;
    }

    if (body.temperament !== undefined) {
      if (!Array.isArray(body.temperament)) {
        throw new ValidationError("temperament must be an array", "temperament");
      }
      for (const t of body.temperament) {
        if (!ALLOWED_TEMPERAMENTS.includes(t)) {
          throw new ValidationError(`Invalid temperament: ${t}`, "temperament");
        }
      }
      updateFields.temperament = body.temperament;
      neo4jFields.temperament = body.temperament;
    }

    if (body.size !== undefined) {
      if (!ALLOWED_SIZES.includes(body.size)) {
        throw new ValidationError(`size must be one of: ${ALLOWED_SIZES.join(", ")}`, "size");
      }
      updateFields.size = body.size;
      neo4jFields.size = body.size;
    }

    if (body.is_vaccinated !== undefined) {
      updateFields.is_vaccinated = body.is_vaccinated;
      neo4jFields.is_vaccinated = body.is_vaccinated;
    }

    if (Object.keys(updateFields).length === 0) {
      throw new ValidationError("No fields to update");
    }

    updateFields.updated_at = new Date().toISOString();

    // 3. Update Supabase
    const { data: updatedPet, error: updateError } = await supabase
      .from("pets")
      .update(updateFields)
      .eq("id", petId)
      .select()
      .single();

    if (updateError) throw updateError;

    // 4. Sync changed fields to Neo4j (only graph-relevant fields)
    if (Object.keys(neo4jFields).length > 1) {
      // Build dynamic SET clause for only the fields that changed
      const setClauses = Object.keys(neo4jFields)
        .filter((k) => k !== "pet_id")
        .map((k) => `p.${k} = $${k}`)
        .join(", ");

      await neo4jQuery(
        `MATCH (p:Pet {id: $pet_id}) SET ${setClauses}`,
        neo4jFields,
      );
    }

    return ok(updatedPet);
  } catch (error) {
    return errorResponse(error);
  }
});
