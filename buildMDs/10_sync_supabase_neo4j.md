# PawBook — Supabase ↔ Neo4j Sync

## Overview
All Neo4j writes are handled by Supabase Edge Functions. The iOS app never touches Neo4j directly. Sync is triggered in two ways:

1. **Inline sync** — Edge Functions that write to Supabase also write to Neo4j in the same request before returning. Used for time-sensitive data (creating pets, friendships).
2. **DB trigger sync** — PostgreSQL triggers call a lightweight Edge Function via `pg_net` for changes that happen via direct SDK calls. Used as a safety net.

---

## Neo4j HTTP Client (Shared Module)

All Edge Functions import this shared module for Neo4j queries.

**`/supabase/functions/_shared/neo4j.ts`**
```typescript
const NEO4J_URI = Deno.env.get("NEO4J_URI")!;       // https://<id>.databases.neo4j.io
const NEO4J_USER = Deno.env.get("NEO4J_USER")!;     // neo4j
const NEO4J_PASS = Deno.env.get("NEO4J_PASS")!;

const authHeader = "Basic " + btoa(`${NEO4J_USER}:${NEO4J_PASS}`);

export async function neo4jQuery(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${NEO4J_URI}/db/neo4j/tx/commit`, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      statements: [{ statement: cypher, parameters: params }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Neo4j error ${response.status}: ${error}`);
  }

  const data = await response.json();

  // Check for Neo4j-level errors
  if (data.errors?.length > 0) {
    throw new Error(`Cypher error: ${data.errors[0].message}`);
  }

  // Parse results into flat row objects
  const result = data.results[0];
  if (!result?.data?.length) return [];

  return result.data.map((row: any) => {
    const obj: Record<string, unknown> = {};
    result.columns.forEach((col: string, i: number) => {
      obj[col] = row.row[i];
    });
    return obj;
  });
}

export async function neo4jBatch(
  statements: Array<{ statement: string; parameters: Record<string, unknown> }>
): Promise<void> {
  const response = await fetch(`${NEO4J_URI}/db/neo4j/tx/commit`, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ statements })
  });

  if (!response.ok) {
    throw new Error(`Neo4j batch error ${response.status}`);
  }

  const data = await response.json();
  if (data.errors?.length > 0) {
    throw new Error(`Cypher batch error: ${data.errors[0].message}`);
  }
}
```

---

## Sync Event Table

| Supabase Event | Trigger Type | Neo4j Operation | Edge Function |
|---|---|---|---|
| `profiles` INSERT | DB trigger | `MERGE (o:Owner)` | `sync-owner-create` |
| `profiles` UPDATE (location/city) | DB trigger | `SET o.lat, o.lng, o.city` | `sync-owner-update` |
| `pets` INSERT | Inline (create-pet) | `MERGE (p:Pet)`, `MERGE (o)-[:OWNS]->(p)` | `create-pet` |
| `pets` UPDATE | DB trigger | `SET p.*` on Pet node | `sync-pet-update` |
| `pets` soft-delete | DB trigger | `SET p.is_active = false` | `sync-pet-update` |
| `pet_relationships` INSERT FRIEND_REQ | Inline | `MERGE (a)-[:SENT_REQUEST_TO]->(b)` | `send-friend-request` |
| `pet_relationships` UPDATE → FRIEND | Inline | Delete SENT_REQUEST_TO, `MERGE FRIENDS_WITH` both dirs | `accept-friend-request` |
| `pet_relationships` UPDATE → BLOCKED | Inline | Delete FRIENDS_WITH, `MERGE BLOCKED` | `block-pet` |
| `pet_relationships` DELETE | DB trigger | Delete corresponding relationship | `sync-relationship-delete` |
| `places` INSERT | Inline (create-place) | `MERGE (pl:Place)` | `create-place` |
| `places` UPDATE | DB trigger | `SET pl.*` | `sync-place-update` |
| `meetups` status → COMPLETED | Inline (complete-meetup) | `MERGE VISITED`, `MERGE MET_AT` for each participant | `complete-meetup` |
| `meetup_reviews` INSERT | Inline (submit-meetup-review) | Update `FRIENDS_WITH.compatibility` score | `submit-meetup-review` |
| `profiles` location UPDATE | Inline (update-location) | `SET o.lat, o.lng, o.city` + propagate to owned Pets | `update-location` |

---

## DB Trigger Sync Edge Functions

These are safety-net triggers. They fire on direct SDK writes that bypass the main Edge Functions (e.g. iOS app updating a pet's bio directly via SDK).

### `sync-owner-create`
Fires on `profiles` INSERT.

```typescript
// /supabase/functions/sync-owner-create/index.ts
Deno.serve(async (req) => {
  const { record } = await req.json(); // Supabase webhook payload

  await neo4jQuery(`
    MERGE (o:Owner {id: $id})
    SET o.display_name = $display_name,
        o.city = $city
  `, {
    id: record.id,
    display_name: record.display_name ?? "",
    city: record.city ?? ""
  });

  return new Response("ok", { status: 200 });
});
```

**Supabase webhook config** (Dashboard → Database → Webhooks):
```
Table:   profiles
Events:  INSERT
URL:     https://<ref>.supabase.co/functions/v1/sync-owner-create
Headers: Authorization: Bearer <service_role_key>
```

---

### `sync-pet-update`
Fires on `pets` UPDATE. Handles profile edits and soft deletes.

```typescript
// /supabase/functions/sync-pet-update/index.ts
Deno.serve(async (req) => {
  const { record, old_record } = await req.json();

  await neo4jQuery(`
    MATCH (p:Pet {id: $id})
    SET p.name = $name,
        p.species = $species,
        p.breed = $breed,
        p.temperament = $temperament,
        p.size = $size,
        p.is_vaccinated = $is_vaccinated,
        p.is_active = $is_active
  `, {
    id: record.id,
    name: record.name,
    species: record.species,
    breed: record.breed ?? "",
    temperament: record.temperament ?? [],
    size: record.size ?? "",
    is_vaccinated: record.is_vaccinated,
    is_active: record.is_active
  });

  return new Response("ok", { status: 200 });
});
```

---

### `sync-relationship-delete`
Fires when a `pet_relationships` row is deleted (not just updated). Cleans up Neo4j edges.

```typescript
// /supabase/functions/sync-relationship-delete/index.ts
Deno.serve(async (req) => {
  const { old_record } = await req.json();

  const { from_pet_id, to_pet_id, rel_type } = old_record;

  if (rel_type === "FRIEND") {
    await neo4jBatch([
      {
        statement: "MATCH (a:Pet {id: $a})-[r:FRIENDS_WITH]->(b:Pet {id: $b}) DELETE r",
        parameters: { a: from_pet_id, b: to_pet_id }
      },
      {
        statement: "MATCH (a:Pet {id: $a})-[r:FRIENDS_WITH]->(b:Pet {id: $b}) DELETE r",
        parameters: { a: to_pet_id, b: from_pet_id }
      }
    ]);
  } else if (rel_type === "FRIEND_REQ") {
    await neo4jQuery(
      "MATCH (a:Pet {id: $a})-[r:SENT_REQUEST_TO]->(b:Pet {id: $b}) DELETE r",
      { a: from_pet_id, b: to_pet_id }
    );
  } else if (rel_type === "BLOCKED") {
    await neo4jQuery(
      "MATCH (a:Pet {id: $a})-[r:BLOCKED]->(b:Pet {id: $b}) DELETE r",
      { a: from_pet_id, b: to_pet_id }
    );
  }

  return new Response("ok", { status: 200 });
});
```

---

### `sync-place-update`
Fires on `places` UPDATE.

```typescript
Deno.serve(async (req) => {
  const { record } = await req.json();

  await neo4jQuery(`
    MERGE (pl:Place {id: $id})
    SET pl.name = $name,
        pl.type = $type,
        pl.avg_rating = $avg_rating,
        pl.is_active = $is_active
  `, {
    id: record.id,
    name: record.name,
    type: record.type,
    avg_rating: record.avg_rating ?? 0,
    is_active: record.is_active
  });

  return new Response("ok", { status: 200 });
});
```

---

## Shared Utilities

**`/supabase/functions/_shared/helpers.ts`**
```typescript
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Auth helper — extracts user from JWT in Authorization header
export async function getAuthUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new AppError("AUTH_MISSING", "Authorization required", 401);

  const supabase = getUserScopedClient(authHeader);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new AppError("AUTH_INVALID", "Invalid token", 401);

  return user;
}

// Create user-scoped Supabase client (respects RLS)
export function getUserScopedClient(authHeader: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

// Create admin Supabase client (bypasses RLS — use carefully)
export function getAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// Assert caller owns a pet
export async function assertPetOwner(
  supabase: SupabaseClient,
  userId: string,
  petId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("pets")
    .select("id")
    .eq("id", petId)
    .eq("owner_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) throw new AppError("AUTH_FORBIDDEN", "You do not own this pet", 403);
}

// Create a notification
export async function createNotification(
  supabase: SupabaseClient,
  notification: { recipient_id: string; type: string; payload: object }
): Promise<void> {
  await supabase.from("notifications").insert(notification);
}

// Standard response helpers
export function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

export function created(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { "Content-Type": "application/json" }
  });
}

// Custom error class
export class AppError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Top-level error handler wrapper for Edge Functions
export function withErrorHandler(
  handler: (req: Request) => Promise<Response>
) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof AppError) {
        return new Response(
          JSON.stringify({ error: err.code, message: err.message }),
          { status: err.status, headers: { "Content-Type": "application/json" } }
        );
      }
      console.error("Unhandled error:", err);
      return new Response(
        JSON.stringify({ error: "INTERNAL_ERROR", message: "Something went wrong" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  };
}
```

---

## Environment Variables

All Edge Functions require these env vars (set in Supabase Dashboard → Settings → Edge Functions):

```bash
# Supabase (auto-injected by runtime)
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Neo4j AuraDB
NEO4J_URI=https://<instance-id>.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASS=<aura-password>
```

---

## Consistency Guarantees

```
Supabase write:  ACID — guaranteed
Neo4j sync:      Eventually consistent — typically < 500ms

Failure scenarios:
  Supabase write succeeds, Neo4j sync fails:
    → Data in Supabase is source of truth
    → DB trigger will retry sync on next relevant event
    → For critical paths (friendships): inline sync retries once before failing

  Neo4j unavailable:
    → All Supabase operations continue normally
    → Graph features (discovery, suggestions) degrade gracefully
    → Return empty arrays with X-Degraded: graph header
    → Alert: Neo4j health check via pg_cron every 5 minutes
```

---

## Health Check

```sql
-- pg_cron: check Neo4j connectivity every 5 minutes
select cron.schedule(
  'neo4j-health-check',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := current_setting('app.edge_function_url') || '/neo4j-health',
      body := '{}'::text,
      headers := json_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      )::jsonb
    );
  $$
);
```

**`sync-neo4j-health` Edge Function**
```typescript
Deno.serve(async () => {
  try {
    await neo4jQuery("RETURN 1 as ping");
    // Log: healthy
    return ok({ neo4j: "healthy" });
  } catch (err) {
    // Log: unhealthy — trigger alert/notification
    console.error("Neo4j health check failed:", err.message);
    return new Response(
      JSON.stringify({ neo4j: "unhealthy", error: err.message }),
      { status: 503 }
    );
  }
});
```
