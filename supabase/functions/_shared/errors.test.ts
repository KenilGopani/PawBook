import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AppError,
  created,
  errorResponse,
  ForbiddenError,
  noContent,
  NotFoundError,
  ok,
  UnauthorizedError,
  ValidationError,
} from "./errors.ts";

Deno.test("error classes carry the right code and HTTP status", () => {
  assertEquals(new NotFoundError().code, "NOT_FOUND");
  assertEquals(new NotFoundError().status, 404);

  assertEquals(new ForbiddenError().code, "AUTH_FORBIDDEN");
  assertEquals(new ForbiddenError().status, 403);

  const v = new ValidationError("bad field", "name");
  assertEquals(v.code, "VALIDATION_ERROR");
  assertEquals(v.status, 400);
  assertEquals(v.field, "name");

  assertEquals(new UnauthorizedError().code, "AUTH_MISSING");
  assertEquals(new UnauthorizedError().status, 401);
});

Deno.test("ok() returns 200 with JSON content-type", async () => {
  const res = ok({ foo: "bar" });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  assertEquals(await res.json(), { foo: "bar" });
});

Deno.test("created() returns 201", async () => {
  const res = created({ id: "1" });
  assertEquals(res.status, 201);
  assertEquals(await res.json(), { id: "1" });
});

Deno.test("noContent() returns 204 with no body", async () => {
  const res = noContent();
  assertEquals(res.status, 204);
  assertEquals(await res.text(), "");
});

Deno.test("errorResponse() formats AppError as { error, message }", async () => {
  const res = errorResponse(new AppError("PET_LIMIT", "Max 10 pets", 400));
  assertEquals(res.status, 400);
  assertEquals(await res.json(), { error: "PET_LIMIT", message: "Max 10 pets" });
});

Deno.test("errorResponse() includes field only for validation errors", async () => {
  const res = errorResponse(new ValidationError("name is required", "name"));
  assertEquals(await res.json(), {
    error: "VALIDATION_ERROR",
    message: "name is required",
    field: "name",
  });
});

Deno.test("errorResponse() maps unknown errors to 500 INTERNAL_ERROR without leaking details", async () => {
  const res = errorResponse(new Error("db connection string leaked here"));
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "INTERNAL_ERROR");
  assertEquals(body.message, "An unexpected error occurred");
});
