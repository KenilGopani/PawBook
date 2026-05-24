# Edge Function Development Guide

## Overview

PawBook Edge Functions are written in TypeScript and run on Deno in Supabase's serverless infrastructure. They serve as the bridge between the iOS app, PostgreSQL, and Neo4j.

---

## Project Structure

```
supabase/functions/
├── _shared/                    # Shared utilities (not deployed as functions)
│   ├── cors.ts                 # CORS headers & preflight handler
│   ├── supabase.ts             # User-scoped & admin Supabase clients
│   ├── neo4j.ts                # Neo4j HTTP API client
│   ├── errors.ts               # AppError classes & response helpers
│   └── validation.ts           # Input validation with spec-defined enums
├── create-pet/
│   └── index.ts
├── update-pet/
│   └── index.ts
├── delete-pet/
│   └── index.ts
├── upload-avatar/
│   └── index.ts
├── upload-pet-avatar/
│   └── index.ts
├── upload-vax-doc/
│   └── index.ts
├── update-location/
│   └── index.ts
├── delete-account/
│   └── index.ts
└── search-pets/
    └── index.ts
```

Each function lives in its own directory with an `index.ts` entry point.
The `_shared/` directory contains utilities imported by all functions (it is NOT deployed as a function itself).

---

## Standard Function Pattern

Every Edge Function follows this pattern:

```typescript
import { handleCors } from "../_shared/cors.ts";
import { createUserClient, getAuthUser } from "../_shared/supabase.ts";
import { ok, errorResponse } from "../_shared/errors.ts";

Deno.serve(async (req) => {
  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") return handleCors();

  try {
    // 2. Create user-scoped Supabase client (RLS enforced)
    const supabase = createUserClient(req);

    // 3. Get authenticated user (throws if invalid JWT)
    const user = await getAuthUser(supabase);

    // 4. Parse request body
    const body = await req.json();

    // 5. Validate input
    // ...

    // 6. Business logic
    // ...

    // 7. Return success response
    return ok({ data: result });
  } catch (error) {
    // 8. Standardized error response
    return errorResponse(error);
  }
});
```

---

## Two Supabase Client Types

### User-Scoped Client (use for most queries)
```typescript
const supabase = createUserClient(req);
// All queries run under RLS for the requesting user
// auth.uid() in RLS policies = the user's JWT sub claim
```

### Admin Client (use for system operations)
```typescript
const adminClient = createAdminClient();
// Bypasses RLS — use only for:
// - Storage uploads (bucket-level policies handle auth)
// - Cross-user queries (e.g., cancel all meetups for a deleted pet)
// - Admin operations (sign out user sessions)
```

---

## Neo4j Integration

All Neo4j operations go through `_shared/neo4j.ts`:

```typescript
import { neo4jQuery, neo4jWrite } from "../_shared/neo4j.ts";

// Read query — returns array of record objects
const results = await neo4jQuery(
  'MATCH (p:Pet {id: $id}) RETURN p.name as name, p.breed as breed',
  { id: petId }
);
// results = [{ name: 'Max', breed: 'Golden Retriever' }]

// Write query — no return value
await neo4jWrite(
  'MERGE (p:Pet {id: $id}) SET p.name = $name',
  { id: petId, name: 'Max' }
);
```

The client uses Neo4j's HTTP Transaction API with auto-commit. Connection details come from environment variables (`NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`).

---

## Error Handling

Use the error classes from `_shared/errors.ts`:

```typescript
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
  UnauthorizedError,
} from "../_shared/errors.ts";

// Validation errors (400)
throw new ValidationError("name is required", "name");
// → { "error": "VALIDATION_ERROR", "message": "name is required", "field": "name" }

// Not found (404)
throw new NotFoundError("Pet not found");
// → { "error": "NOT_FOUND", "message": "Pet not found" }

// Forbidden (403)
throw new ForbiddenError("You do not own this pet");
// → { "error": "AUTH_FORBIDDEN", "message": "You do not own this pet" }

// Custom errors
throw new AppError("PET_LIMIT", "Maximum 10 pets per account", 400);
// → { "error": "PET_LIMIT", "message": "Maximum 10 pets per account" }
```

---

## Adding a New Edge Function

1. **Create the directory**:
   ```bash
   mkdir supabase/functions/my-new-function
   ```

2. **Create `index.ts`** following the standard pattern above.

3. **Import shared utilities** from `../_shared/`.

4. **Test locally**:
   ```bash
   supabase functions serve my-new-function --env-file .env
   ```

5. **Test with curl**:
   ```bash
   curl -X POST http://localhost:54321/functions/v1/my-new-function \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"key": "value"}'
   ```

6. **Deploy**:
   ```bash
   supabase functions deploy my-new-function
   ```

7. **Set secrets** (if new env vars needed):
   ```bash
   supabase secrets set MY_NEW_VAR=value
   ```

---

## Local Development

### Prerequisites
- Supabase CLI installed
- Deno 1.30+ installed
- `.env` file configured (copy from `.env.example`)

### Start local development
```bash
# Start the Supabase local stack (PostgreSQL, Auth, Storage, etc.)
supabase start

# Serve a specific function
supabase functions serve create-pet --env-file .env

# Serve all functions
supabase functions serve --env-file .env
```

### Run migrations locally
```bash
supabase db push
```

---

## Deployment

### Deploy a single function
```bash
supabase functions deploy create-pet
```

### Deploy all functions
```bash
supabase functions deploy
```

### Set production secrets
```bash
supabase secrets set NEO4J_URI=https://your-instance.databases.neo4j.io
supabase secrets set NEO4J_USER=neo4j
supabase secrets set NEO4J_PASSWORD=your-password
```

---

## Checklist for New Functions

- [ ] CORS: Handle `OPTIONS` preflight at the top
- [ ] Auth: Use `createUserClient` + `getAuthUser`
- [ ] Validation: Validate all input before processing
- [ ] RLS: Use user-scoped client for user-data queries
- [ ] Admin: Use admin client only when RLS needs bypassing
- [ ] Neo4j: Sync graph-relevant data changes
- [ ] Errors: Use `AppError` subclasses, return via `errorResponse()`
- [ ] Response: Use `ok()` or `created()` helpers for consistent format
