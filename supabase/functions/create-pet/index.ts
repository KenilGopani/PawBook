/**
 * Edge Function: create-pet
 *
 * Create a new pet profile:
 * 1. Validate input fields
 * 2. Enforce 10-pet limit per owner
 * 3. Insert into Supabase pets table
 * 4. Create Pet node in Neo4j
 * 5. Link Owner→Pet in Neo4j
 *
 * POST /functions/v1/create-pet
 * Body: { name, species, breed?, dob?, gender?, bio?, temperament?, size? }
 *
 * See: 04_service_user_pet.md — POST /pets
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { neo4jQuery } from "../_shared/neo4j.ts";
import { created, errorResponse, AppError } from "../_shared/errors.ts";
import { validateCreatePet } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const body = await req.json();

    // 1. Validate input
    const petInput = validateCreatePet(body);

    // 2. Check pet limit (max 10 active pets per owner)
    const { count, error: countError } = await supabase
      .from("pets")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("is_active", true);

    if (countError) throw countError;

    if (count !== null && count >= 10) {
      throw new AppError("PET_LIMIT", "Maximum 10 pets per account", 400);
    }

    // 3. Insert pet in Supabase
    const { data: pet, error: insertError } = await supabase
      .from("pets")
      .insert({
        owner_id: user.id,
        name: petInput.name,
        species: petInput.species,
        breed: petInput.breed || null,
        dob: petInput.dob || null,
        gender: petInput.gender || null,
        bio: petInput.bio || null,
        temperament: petInput.temperament || [],
        size: petInput.size || null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 4. Get owner profile for Neo4j location data
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, city, location")
      .eq("id", user.id)
      .single();

    // 5. Create Pet node in Neo4j + link to Owner
    await neo4jQuery(
      `
      MERGE (p:Pet {id: $id})
      SET p.name = $name,
          p.species = $species,
          p.breed = $breed,
          p.temperament = $temperament,
          p.size = $size,
          p.is_vaccinated = $is_vaccinated,
          p.owner_id = $owner_id,
          p.city = $city,
          p.created_at = $created_at
      WITH p
      MERGE (o:Owner {id: $owner_id})
      SET o.display_name = $display_name,
          o.city = $city
      MERGE (o)-[:OWNS {since: $created_at}]->(p)
      `,
      {
        id: pet.id,
        name: pet.name,
        species: pet.species,
        breed: pet.breed || "",
        temperament: pet.temperament || [],
        size: pet.size || "",
        is_vaccinated: pet.is_vaccinated,
        owner_id: user.id,
        city: profile?.city || "",
        display_name: profile?.display_name || "",
        created_at: pet.created_at,
      }
    );

    return created(pet);
  } catch (error) {
    return errorResponse(error);
  }
});
