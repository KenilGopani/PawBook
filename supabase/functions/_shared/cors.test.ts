import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { corsHeaders, handleCors, withCors } from "./cors.ts";

Deno.test("handleCors() returns an ok response carrying CORS headers", async () => {
  const res = handleCors();
  assertEquals(await res.text(), "ok");
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(
    res.headers.get("Access-Control-Allow-Methods"),
    corsHeaders["Access-Control-Allow-Methods"],
  );
});

Deno.test("corsHeaders allow-list includes idempotency-key", () => {
  assertEquals(
    corsHeaders["Access-Control-Allow-Headers"].includes("idempotency-key"),
    true,
  );
});

Deno.test("withCors() merges CORS headers onto an existing response without dropping its body/status", async () => {
  const original = new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });

  const wrapped = withCors(original);

  assertEquals(wrapped.status, 201);
  assertEquals(wrapped.headers.get("Content-Type"), "application/json");
  assertEquals(wrapped.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(await wrapped.json(), { ok: true });
});
