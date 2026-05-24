/**
 * Edge Function: upload-vax-doc
 *
 * Upload a vaccination certificate document (PDF or image) to Supabase Storage.
 * Updates vaccination_records.doc_url and sets pets.is_vaccinated = true.
 *
 * POST /functions/v1/upload-vax-doc
 * Body: multipart/form-data with "file", "pet_id", and "record_id" fields
 *
 * See: 04_service_user_pet.md — POST /pets/:id/vaccinations/:record_id/document
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, createAdminClient, getAuthUser } from "../_shared/supabase.ts";
import { ok, errorResponse, AppError, ForbiddenError, NotFoundError } from "../_shared/errors.ts";
import { validateDocFile } from "../_shared/validation.ts";

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
    const recordId = formData.get("record_id") as string | null;

    if (!file) {
      throw new AppError("INVALID_FILE", "No file provided", 400);
    }
    if (!petId) {
      throw new AppError("VALIDATION_ERROR", "pet_id is required", 400);
    }
    if (!recordId) {
      throw new AppError("VALIDATION_ERROR", "record_id is required", 400);
    }

    // Verify caller owns the pet
    const { data: pet, error: petError } = await supabase
      .from("pets")
      .select("id, owner_id")
      .eq("id", petId)
      .eq("is_active", true)
      .single();

    if (petError || !pet) {
      throw new NotFoundError("Pet not found");
    }

    if (pet.owner_id !== user.id) {
      throw new ForbiddenError("You do not own this pet");
    }

    // Verify vaccination record exists and belongs to this pet
    const { data: record, error: recordError } = await supabase
      .from("vaccination_records")
      .select("id, pet_id")
      .eq("id", recordId)
      .eq("pet_id", petId)
      .single();

    if (recordError || !record) {
      throw new NotFoundError("Vaccination record not found");
    }

    // Validate file type and size (PDF, JPEG, PNG — max 10MB)
    validateDocFile(file, 10);

    // Determine file extension from type
    const ext = file.type === "application/pdf" ? "pdf" : "jpg";
    const filePath = `${petId}/${recordId}.${ext}`;

    // Upload to private vax-docs bucket
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await adminClient.storage
      .from("vax-docs")
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      throw new AppError("UPLOAD_FAILED", uploadError.message, 500);
    }

    // Get signed URL (private bucket — no public URL)
    const { data: signedUrlData } = await adminClient.storage
      .from("vax-docs")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1-year signed URL

    const docUrl = signedUrlData?.signedUrl || filePath;

    // Update vaccination record with document URL
    const { error: updateRecordError } = await adminClient
      .from("vaccination_records")
      .update({ doc_url: docUrl })
      .eq("id", recordId);

    if (updateRecordError) throw updateRecordError;

    // Update pet's vaccinated status
    const { error: updatePetError } = await supabase
      .from("pets")
      .update({
        is_vaccinated: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", petId);

    if (updatePetError) throw updatePetError;

    return ok({
      doc_url: docUrl,
      is_vaccinated: true,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
