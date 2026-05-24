# PawBook — API Conventions

## Overview
This document defines the standards that apply across all PawBook Edge Functions and SDK calls. Any AI agent implementing this backend must follow these conventions consistently.

---

## Base URLs

```
Edge Functions (production):  https://<project-ref>.supabase.co/functions/v1
Edge Functions (local dev):   http://localhost:54321/functions/v1
Supabase REST API:            https://<project-ref>.supabase.co/rest/v1
Supabase Auth:                https://<project-ref>.supabase.co/auth/v1
Supabase Realtime:            wss://<project-ref>.supabase.co/realtime/v1
```

---

## Required Headers

### Every request (client → server)
```
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
X-App-Version: 1.0.0
X-Platform: ios
```

### Every response (server → client)
```
Content-Type: application/json
X-Request-ID: <uuid>          -- echo back for debugging
X-Response-Time: 142ms        -- server-side processing time
```

### Degraded mode header
```
X-Degraded: graph             -- returned when Neo4j is unavailable
                              -- client shows simplified UI (no discovery)
```

---

## HTTP Methods & Semantics

| Method | Usage | Body | Idempotent |
|---|---|---|---|
| GET | Fetch resource(s) | None | Yes |
| POST | Create resource or trigger action | JSON | No |
| PATCH | Partial update | JSON (only changed fields) | Yes |
| DELETE | Remove or soft-delete | None or minimal JSON | Yes |

**No PUT** — all updates use PATCH.

---

## Standard Response Envelope

### Success — single resource
```json
{
  "id": "uuid",
  "field": "value",
  "created_at": "2024-01-20T10:00:00Z"
}
```

### Success — list of resources
```json
{
  "data": [ { ... }, { ... } ],
  "pagination": {
    "next_cursor": "2024-01-15T10:00:00Z",
    "has_more": true,
    "limit": 20
  }
}
```

### Success — action (no resource returned)
```json
{ "success": true }
```

### Error
```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description",
  "field": "field_name"
}
```

`field` is only present for `VALIDATION_ERROR` responses — it identifies which input field failed.

---

## Pagination

All list endpoints use **cursor-based pagination** (not page numbers). Cursors are always `created_at` timestamps (ISO 8601).

### Request
```
GET /feed?limit=20&cursor=2024-01-15T10:00:00Z
```

### Response
```json
{
  "data": [ ... ],
  "pagination": {
    "next_cursor": "2024-01-10T08:00:00Z",
    "has_more": true,
    "limit": 20
  }
}
```

### Rules
- `limit` max is 50 for all endpoints unless specified otherwise
- `limit` default is 20 unless specified otherwise
- When `has_more` is false, `next_cursor` is null
- Pass `next_cursor` value as `cursor` param on next request
- Results are always ordered `created_at DESC` unless specified

### iOS Implementation
```swift
struct PaginatedResponse<T: Codable>: Codable {
    let data: [T]
    let pagination: Pagination
}

struct Pagination: Codable {
    let nextCursor: String?
    let hasMore: Bool
    let limit: Int
}

// Infinite scroll pattern
func loadMore() async {
    guard !isLoading && pagination?.hasMore != false else { return }
    isLoading = true
    let response = try await fetchFeed(cursor: pagination?.nextCursor)
    items.append(contentsOf: response.data)
    pagination = response.pagination
    isLoading = false
}
```

---

## Error Codes

### Global error codes (all services)

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_MISSING` | 401 | No Authorization header |
| `AUTH_EXPIRED` | 401 | JWT is expired — client must refresh |
| `AUTH_INVALID` | 401 | JWT is malformed or signature invalid |
| `AUTH_FORBIDDEN` | 403 | Valid JWT but insufficient permissions |
| `NOT_FOUND` | 404 | Resource does not exist or is inactive |
| `VALIDATION_ERROR` | 400 | Request body failed validation (see `field`) |
| `DUPLICATE` | 409 | Unique constraint — resource already exists |
| `INVALID_STATE` | 409 | Operation not valid for current resource state |
| `RATE_LIMITED` | 429 | Too many requests — see `Retry-After` header |
| `INTERNAL_ERROR` | 500 | Unhandled server error — retryable |
| `GRAPH_ERROR` | 500 | Neo4j unavailable or query failed — retryable |

### Service-specific codes

| Code | HTTP | Service | Meaning |
|---|---|---|---|
| `ALREADY_FRIENDS` | 409 | Social | Pets are already friends |
| `REQUEST_PENDING` | 409 | Social | Friend request already exists |
| `BLOCKED` | 403 | Social | One pet has blocked the other |
| `INVALID_REQUEST` | 400 | Social | Cannot send request to yourself |
| `PET_LIMIT` | 400 | User/Pet | Max 10 pets per account |
| `INVALID_FILE` | 400 | Media | File type or size not allowed |
| `INVALID_MEDIA_URL` | 400 | Feed | URL is not a valid Storage URL |
| `MEETUP_FULL` | 409 | Meetup | Participant count at maximum |
| `TOO_LATE_TO_CANCEL` | 409 | Meetup | Within 2 hours of scheduled time |
| `LOCATION_DISABLED` | 403 | Location | User has not enabled location sharing |
| `RATE_LIMITED` | 429 | Alerts | Too many alerts submitted |
| `SELF_REPORT` | 400 | Reports | Cannot report your own content |
| `ALERT_EXPIRED` | 409 | Alerts | Alert is no longer active |

---

## Validation Rules (Global)

| Field type | Rule |
|---|---|
| UUID | Must be valid UUID v4 format |
| Timestamps | ISO 8601 format: `2024-01-20T10:00:00Z` |
| Latitude | Float, -90.0 to 90.0 |
| Longitude | Float, -180.0 to 180.0 |
| Strings | Trimmed, no leading/trailing whitespace |
| Arrays | Must not contain null values |
| Enum fields | Rejected if value not in defined list |

---

## Rate Limiting

Applied per `auth.uid()` (not per IP).

| Endpoint category | Limit |
|---|---|
| General API | 300 requests / minute |
| Post creation | 20 posts / hour |
| Friend requests | 50 requests / hour |
| Lost pet alerts | 1 active alert per pet at a time |
| Community alerts | 3 alerts / 24 hours per user |
| Moderation reports | 10 reports / hour |
| Media uploads | 50 uploads / hour |

Rate limit responses include:
```
HTTP 429 Too Many Requests
Retry-After: 60
```
```json
{
  "error": "RATE_LIMITED",
  "message": "Too many requests. Try again in 60 seconds.",
  "retry_after": 60
}
```

---

## Date & Time

- All timestamps stored and returned in **UTC**
- Format: ISO 8601 with Z suffix: `2024-01-20T10:00:00Z`
- iOS app converts to local timezone for display only
- Never store or accept local times from the client

```swift
// iOS: parse UTC, display local
let formatter = ISO8601DateFormatter()
let date = formatter.date(from: record.createdAt)
let display = date.formatted(.relative(presentation: .named)) // "2 hours ago"
```

---

## Soft Deletes

**Never hard delete** user-generated content. Always soft delete.

| Table | Soft delete field |
|---|---|
| profiles | `is_active = false` |
| pets | `is_active = false` |
| posts | `is_active = false` |
| comments | `is_active = false` |
| lost_pet_alerts | `status = 'RESOLVED'` or `'EXPIRED'` |
| community_alerts | `is_active = false` |
| meetups | `status = 'CANCELLED'` |

All `SELECT` queries filter on the active flag. RLS policies also enforce this.

---

## Supabase SDK Patterns (iOS)

### Typed model from DB query
```swift
struct Pet: Codable {
    let id: UUID
    let name: String
    let species: String
    let breed: String?
    let avatarUrl: String?
    let temperament: [String]
    let isVaccinated: Bool
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, species, breed
        case avatarUrl = "avatar_url"
        case temperament
        case isVaccinated = "is_vaccinated"
        case createdAt = "created_at"
    }
}
```

### Error handling pattern
```swift
do {
    let result = try await supabase
        .from("pets")
        .select("*")
        .eq("id", value: petId)
        .single()
        .execute()
    let pet = try result.value as Pet
} catch let error as PostgrestError {
    switch error.code {
    case "PGRST116": // No rows found
        handleNotFound()
    default:
        handleGenericError(error.message)
    }
} catch {
    handleGenericError(error.localizedDescription)
}
```

### Edge Function call pattern
```swift
func callEdgeFunction<T: Decodable>(
    name: String,
    body: Encodable
) async throws -> T {
    let response = try await supabase.functions
        .invoke(name, options: .init(body: body))

    // Parse standard error envelope
    if let errorResponse = try? JSONDecoder().decode(APIError.self, from: response) {
        throw AppError(code: errorResponse.error, message: errorResponse.message)
    }

    return try JSONDecoder().decode(T.self, from: response)
}

struct APIError: Codable {
    let error: String
    let message: String
    let field: String?
}
```

---

## Idempotency

For operations where duplicate calls could cause issues, the client should:

1. Generate a client-side idempotency key (UUID) before sending
2. Pass it as a header: `Idempotency-Key: <uuid>`
3. Server stores the result against the key for 24 hours and returns cached result on duplicate

Applies to: post creation, meetup creation, friend requests, alert creation.

```swift
let idempotencyKey = UUID().uuidString

let response = try await supabase.functions.invoke(
    "create-post",
    options: .init(
        body: postBody,
        headers: ["Idempotency-Key": idempotencyKey]
    )
)
```

---

## Versioning

API versioning is embedded in the Edge Function URL path:
```
/functions/v1/<function-name>
```

When a breaking change is needed:
1. Deploy new version alongside old: `/functions/v2/<function-name>`
2. Update iOS app to call v2
3. Deprecate v1 after 90 days (return `Deprecation: true` header + sunset date)
4. Remove v1 after sunset date

Non-breaking changes (additive fields, new optional params) do not require a version bump.

---

## CORS

Edge Functions must handle CORS for web clients (admin dashboard). iOS app does not need CORS headers but they should be present for future web support.

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-App-Version, X-Platform, Idempotency-Key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
};

Deno.serve(withErrorHandler(async (req) => {
  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  // ... function logic

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}));
```

---

## Edge Function File Structure

```
supabase/
  functions/
    _shared/
      neo4j.ts          -- Neo4j HTTP client
      helpers.ts        -- Auth, error handling, response helpers
    create-pet/
      index.ts
    update-pet/
      index.ts
    delete-pet/
      index.ts
    send-friend-request/
      index.ts
    accept-friend-request/
      index.ts
    decline-friend-request/
      index.ts
    block-pet/
      index.ts
    discover-nearby/
      index.ts
    discover-suggested/
      index.ts
    discover-compatible/
      index.ts
    mutual-friends/
      index.ts
    get-feed/
      index.ts
    get-upload-url/
      index.ts
    create-post/
      index.ts
    react-to-post/
      index.ts
    add-comment/
      index.ts
    get-explore/
      index.ts
    create-meetup/
      index.ts
    schedule-meetup/
      index.ts
    rsvp-meetup/
      index.ts
    invite-to-meetup/
      index.ts
    cancel-meetup/
      index.ts
    complete-meetup/
      index.ts
    submit-meetup-review/
      index.ts
    places-nearby/
      index.ts
    create-place/
      index.ts
    review-place/
      index.ts
    place-checkins/
      index.ts
    place-social-proof/
      index.ts
    search-places/
      index.ts
    update-location/
      index.ts
    nearby-pets/
      index.ts
    create-lost-pet-alert/
      index.ts
    lost-pets-nearby/
      index.ts
    report-sighting/
      index.ts
    create-community-alert/
      index.ts
    submit-report/
      index.ts
    upload-avatar/
      index.ts
    upload-pet-avatar/
      index.ts
    upload-vax-doc/
      index.ts
    update-location/
      index.ts
    delete-account/
      index.ts
    sync-owner-create/
      index.ts
    sync-pet-update/
      index.ts
    sync-relationship-delete/
      index.ts
    sync-place-update/
      index.ts
    neo4j-health/
      index.ts
```
