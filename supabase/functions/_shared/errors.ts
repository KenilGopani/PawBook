/**
 * Standardized error handling for Supabase Edge Functions.
 *
 * Error codes follow the convention from 04_service_user_pet.md:
 *   NOT_FOUND, AUTH_FORBIDDEN, VALIDATION_ERROR, PET_LIMIT,
 *   INVALID_FILE, DUPLICATE, AUTH_MISSING, AUTH_EXPIRED, AUTH_INVALID
 */

import { corsHeaders } from "./cors.ts";

// ─── Error Classes ────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
    public field?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super("NOT_FOUND", message, 404);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super("AUTH_FORBIDDEN", message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super("VALIDATION_ERROR", message, 400, field);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authorization header required") {
    super("AUTH_MISSING", message, 401);
  }
}

// ─── Response Helpers ─────────────────────────────────────

/**
 * Success response (200 OK)
 */
export function ok(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Created response (201 Created)
 */
export function created(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * No content response (204)
 */
export function noContent(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * Error response — formats AppError instances into standard JSON.
 *
 * Response format:
 * {
 *   "error": "ERROR_CODE",
 *   "message": "Human-readable message",
 *   "field": "field_name"  // optional, for validation errors
 * }
 */
export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    const body: Record<string, unknown> = {
      error: error.code,
      message: error.message,
    };
    if (error.field) {
      body.field = error.field;
    }
    return new Response(JSON.stringify(body), {
      status: error.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Unknown error — log and return 500
  console.error("Unhandled error:", error);
  return new Response(
    JSON.stringify({
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    }),
    {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
