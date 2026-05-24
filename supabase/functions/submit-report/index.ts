/**
 * Edge Function: submit-report
 *
 * Submit a moderation report for a post, comment, profile, pet, or place.
 * Enforces rate limits, validates targets, prevents self-reporting, and logs auto-flags.
 *
 * POST /functions/v1/submit-report
 * Body: { target_type, target_id, reason, details }
 */

import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { created, errorResponse, AppError, NotFoundError } from "../_shared/errors.ts";
import { ALLOWED_REPORT_REASONS, ALLOWED_REPORT_TARGETS } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabase = createUserClient(req);
    const user = await getAuthUser(supabase);
    const body = await req.json();

    const { target_type, target_id, reason, details } = body;

    // 1. Validation
    if (!target_type || !target_id || !reason) {
      throw new AppError("VALIDATION_ERROR", "target_type, target_id, and reason are required", 400);
    }

    if (!ALLOWED_REPORT_TARGETS.includes(target_type as any)) {
      throw new AppError("VALIDATION_ERROR", `target_type must be one of: ${ALLOWED_REPORT_TARGETS.join(", ")}`, 400);
    }

    if (!ALLOWED_REPORT_REASONS.includes(reason as any)) {
      throw new AppError("INVALID_REASON", `reason must be one of: ${ALLOWED_REPORT_REASONS.join(", ")}`, 400);
    }

    if (details && details.length > 500) {
      throw new AppError("VALIDATION_ERROR", "details must be under 500 characters", 400);
    }

    // 2. Rate limit: Max 10 reports per user per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: userReportsCount, error: userReportsError } = await supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("reporter_id", user.id)
      .gte("created_at", oneHourAgo);

    if (userReportsError) throw userReportsError;

    if (userReportsCount !== null && userReportsCount >= 10) {
      throw new AppError("RATE_LIMITED", "Max 10 reports per hour", 429);
    }

    // 3. Verify target exists and prevent self-reporting
    let ownerId: string | null = null;

    if (target_type === "profile") {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", target_id)
        .eq("is_active", true)
        .single();

      if (profileError || !profile) throw new NotFoundError("Profile not found");
      ownerId = profile.id;
    } else if (target_type === "pet") {
      const { data: pet, error: petError } = await supabase
        .from("pets")
        .select("id, owner_id")
        .eq("id", target_id)
        .eq("is_active", true)
        .single();

      if (petError || !pet) throw new NotFoundError("Pet not found");
      ownerId = pet.owner_id;
    } else if (target_type === "post") {
      const { data: post, error: postError } = await supabase
        .from("posts")
        .select("id, pet_id, pets!pet_id(owner_id)")
        .eq("id", target_id)
        .eq("is_active", true)
        .single();

      if (postError || !post) throw new NotFoundError("Post not found");
      ownerId = post.pets?.owner_id || null;
    } else if (target_type === "comment") {
      const { data: comment, error: commentError } = await supabase
        .from("comments")
        .select("id, author_pet_id, pets!author_pet_id(owner_id)")
        .eq("id", target_id)
        .eq("is_active", true)
        .single();

      if (commentError || !comment) throw new NotFoundError("Comment not found");
      ownerId = comment.pets?.owner_id || null;
    } else if (target_type === "place") {
      const { data: place, error: placeError } = await supabase
        .from("places")
        .select("id, added_by")
        .eq("id", target_id)
        .eq("is_active", true)
        .single();

      if (placeError || !place) throw new NotFoundError("Place not found");
      ownerId = place.added_by || null;
    }

    if (ownerId && ownerId === user.id) {
      throw new AppError("SELF_REPORT", "You cannot report your own content", 400);
    }

    // 4. Insert report
    const { data: report, error: insertError } = await supabase
      .from("reports")
      .insert({
        reporter_id: user.id,
        target_type,
        target_id,
        reason,
        details: details || null,
        status: "PENDING",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 5. Auto-flag check: 5+ reports with same reason in last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: reportCount, error: countError } = await supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("target_type", target_type)
      .eq("target_id", target_id)
      .eq("reason", reason)
      .gte("created_at", twentyFourHoursAgo);

    if (!countError && reportCount !== null && reportCount >= 5) {
      console.log(`[Auto-Flag] Target ${target_type} (${target_id}) reached 5+ reports for reason ${reason} within 24 hours.`);
      // Optional: perform content flags in db if columns are added in the future
    }

    return created(report);
  } catch (error) {
    return errorResponse(error);
  }
});
