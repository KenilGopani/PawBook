/**
 * Edge Function: get-upload-url
 *
 * Generate a pre-signed upload URL for post media.
 * Validates file type and size before generating the URL.
 *
 * POST /functions/v1/get-upload-url
 * Body: { pet_id, file_name, content_type, file_size_bytes }
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { AppError, errorResponse, ok } from "../_shared/errors.ts";
import { assertPetOwner } from "../_shared/helpers.ts";
import { ALLOWED_MEDIA_CONTENT_TYPES } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const { pet_id, file_name, content_type, file_size_bytes } = await req.json();

    if (!pet_id || !file_name || !content_type || file_size_bytes === undefined) {
      throw new AppError(
        "VALIDATION_ERROR",
        "pet_id, file_name, content_type, and file_size_bytes are required",
        400,
      );
    }

    // 1. Verify caller owns pet_id
    await assertPetOwner(supabase, user.id, pet_id);

    // 2. Validate file type
    if (!ALLOWED_MEDIA_CONTENT_TYPES.includes(content_type as any)) {
      throw new AppError("INVALID_FILE", `Content type ${content_type} is not allowed`, 400);
    }

    // Validate size (photo: 10MB, video: 100MB)
    const isVideo = content_type.startsWith("video/");
    const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file_size_bytes > maxSize) {
      throw new AppError(
        "INVALID_FILE",
        `File size exceeds the limit (${isVideo ? "100MB" : "10MB"})`,
        400,
      );
    }

    // 3. Generate unique storage path: {pet_id}/{uuid}.{ext}
    const uuid = crypto.randomUUID();
    const ext = file_name.split(".").pop() || (isVideo ? "mp4" : "jpg");
    const filePath = `${pet_id}/${uuid}.${ext}`;

    // 4. Create signed upload URL
    const { data, error: uploadUrlError } = await supabase.storage
      .from("post-media")
      .createSignedUploadUrl(filePath);

    if (uploadUrlError) throw uploadUrlError;

    // 5. Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from("post-media")
      .getPublicUrl(filePath);

    return ok({
      upload_url: data.signedUrl,
      storage_path: `post-media/${filePath}`,
      public_url: publicUrl,
      expires_in: 300,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
