/**
 * Edge Function: upload-pet-avatar
 *
 * Upload pet avatar to Supabase Storage "pet-avatars" bucket.
 * Updates pets.avatar_url with the public URL.
 *
 * POST /functions/v1/upload-pet-avatar
 * Body: multipart/form-data with "file" and "pet_id" fields
 *
 * See: 04_service_user_pet.md — POST /pets/:id/avatar
 */

import { handleCors } from "../_shared/cors.ts";
import { createAdminClient, createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { AppError, errorResponse, ForbiddenError, NotFoundError, ok } from "../_shared/errors.ts";
import { validateImageFile } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const adminClient = createAdminClient();

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const petId = formData.get("pet_id") as string | null;

    if (!file) {
      throw new AppError("INVALID_FILE", "No file provided", 400);
    }
    if (!petId) {
      throw new AppError("VALIDATION_ERROR", "pet_id is required", 400);
    }

    // Verify caller owns the pet
    const { data: pet, error: fetchError } = await supabase
      .from("pets")
      .select("id, owner_id")
      .eq("id", petId)
      .eq("is_active", true)
      .single();

    if (fetchError || !pet) {
      throw new NotFoundError("Pet not found");
    }

    if (pet.owner_id !== user.id) {
      throw new ForbiddenError("You do not own this pet");
    }

    // Validate file type and size
    validateImageFile(file, 5);

    // Upload to Supabase Storage
    const filePath = `${petId}/avatar.jpg`;
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await adminClient.storage
      .from("pet-avatars")
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      throw new AppError("UPLOAD_FAILED", uploadError.message, 500);
    }

    // Get public URL
    const { data: urlData } = adminClient.storage
      .from("pet-avatars")
      .getPublicUrl(filePath);

    const avatarUrl = urlData.publicUrl;

    // Update pet with new avatar URL
    const { error: updateError } = await supabase
      .from("pets")
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", petId);

    if (updateError) throw updateError;

    return ok({ avatar_url: avatarUrl });
  } catch (error) {
    return errorResponse(error);
  }
});
