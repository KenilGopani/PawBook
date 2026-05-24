/**
 * Edge Function: upload-avatar
 *
 * Upload profile avatar to Supabase Storage "avatars" bucket.
 * Updates profiles.avatar_url with the public URL.
 *
 * POST /functions/v1/upload-avatar
 * Body: multipart/form-data with "file" field (JPEG or PNG, max 5MB)
 *
 * See: 04_service_user_pet.md — POST /profile/avatar
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, createAdminClient, getAuthUser } from "../_shared/supabase.ts";
import { ok, errorResponse, AppError } from "../_shared/errors.ts";
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

    if (!file) {
      throw new AppError("INVALID_FILE", "No file provided", 400);
    }

    // Validate file type and size
    validateImageFile(file, 5);

    // Upload to Supabase Storage
    const filePath = `${user.id}/profile.jpg`;
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await adminClient.storage
      .from("avatars")
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: true, // Overwrite existing avatar
      });

    if (uploadError) {
      throw new AppError("UPLOAD_FAILED", uploadError.message, 500);
    }

    // Get public URL
    const { data: urlData } = adminClient.storage
      .from("avatars")
      .getPublicUrl(filePath);

    const avatarUrl = urlData.publicUrl;

    // Update profile with new avatar URL
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) throw updateError;

    return ok({ avatar_url: avatarUrl });
  } catch (error) {
    return errorResponse(error);
  }
});
