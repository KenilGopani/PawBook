import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withIdempotency } from "./idempotency.ts";

/**
 * Minimal fake covering exactly the chain idempotency.ts calls:
 *   .from("idempotency_keys").select(...).eq().eq().eq().maybeSingle()
 *   .from("idempotency_keys").insert({...})
 */
function makeFakeSupabase(opts: {
  existing?: { status_code: number; response_body: unknown } | null;
  insertError?: { code: string } | null;
}) {
  const inserted: unknown[] = [];
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: opts.existing ?? null, error: null }),
    insert: (row: unknown) => {
      inserted.push(row);
      return Promise.resolve({ error: opts.insertError ?? null });
    },
  };
  const client = { from: () => builder } as unknown as SupabaseClient;
  return { client, inserted };
}

Deno.test("withIdempotency: no header runs the handler and skips storage entirely", async () => {
  const { client, inserted } = makeFakeSupabase({ existing: null });
  let calls = 0;

  const req = new Request("https://example.com/create-post", { method: "POST" });
  const res = await withIdempotency(req, client, "user-1", "create-post", () => {
    calls++;
    return Promise.resolve(new Response(JSON.stringify({ id: "post-1" }), { status: 201 }));
  });

  assertEquals(calls, 1);
  assertEquals(res.status, 201);
  assertEquals(inserted.length, 0);
});

Deno.test("withIdempotency: new key runs the handler once and caches a 2xx result", async () => {
  const { client, inserted } = makeFakeSupabase({ existing: null });
  let calls = 0;

  const req = new Request("https://example.com/create-post", {
    method: "POST",
    headers: { "Idempotency-Key": "key-abc" },
  });
  const res = await withIdempotency(req, client, "user-1", "create-post", () => {
    calls++;
    return Promise.resolve(new Response(JSON.stringify({ id: "post-1" }), { status: 201 }));
  });

  assertEquals(calls, 1);
  assertEquals(res.status, 201);
  assertEquals(await res.json(), { id: "post-1" });
  assertEquals(inserted.length, 1);
  assertEquals((inserted[0] as { key: string }).key, "key-abc");
});

Deno.test("withIdempotency: a validation error (4xx) is never cached", async () => {
  const { client, inserted } = makeFakeSupabase({ existing: null });

  const req = new Request("https://example.com/create-post", {
    method: "POST",
    headers: { "Idempotency-Key": "key-abc" },
  });
  const res = await withIdempotency(req, client, "user-1", "create-post", () => {
    return Promise.resolve(
      new Response(JSON.stringify({ error: "VALIDATION_ERROR" }), { status: 400 }),
    );
  });

  assertEquals(res.status, 400);
  assertEquals(inserted.length, 0);
});

Deno.test("withIdempotency: a cached key replays the stored response without calling the handler", async () => {
  const { client } = makeFakeSupabase({
    existing: { status_code: 201, response_body: { id: "post-1" } },
  });
  let calls = 0;

  const req = new Request("https://example.com/create-post", {
    method: "POST",
    headers: { "Idempotency-Key": "key-abc" },
  });
  const res = await withIdempotency(req, client, "user-1", "create-post", () => {
    calls++;
    return Promise.resolve(new Response(JSON.stringify({ id: "should-not-run" }), { status: 201 }));
  });

  assertEquals(calls, 0);
  assertEquals(res.status, 201);
  assertEquals(await res.json(), { id: "post-1" });
  assertEquals(res.headers.get("Idempotent-Replayed"), "true");
});
