# PawBook — Service: Meetups

## Overview
The meetup service manages the full lifecycle of pet playdates — from request to completion. Meetups can be 1-on-1 or group. After completion, participants are prompted for reviews and the Neo4j graph is updated with `VISITED` and `MET_AT` relationships, strengthening the social graph.

---

## Meetup Lifecycle State Machine

```
PENDING   ──► ACCEPTED   ──► SCHEDULED  ──► COMPLETED
              │                │
              ▼                ▼
           CANCELLED        CANCELLED

Transitions:
  PENDING   → ACCEPTED    when invited pet owner accepts
  PENDING   → CANCELLED   when organizer cancels or invite expires (48h)
  ACCEPTED  → SCHEDULED   when organizer sets date/time + place
  SCHEDULED → COMPLETED   via scheduled job (after scheduled_at + 2h)
  SCHEDULED → CANCELLED   by organizer (up to 2h before scheduled_at)
  COMPLETED → (locked)    no further state changes
```

---

## Meetup Endpoints

### POST /meetups `[Edge Function]`
Create a new meetup request. Notifies invited pet owners.

**Edge Function: `create-meetup`**

**Request**
```json
{
  "title": "Sunday Playdate at Dolores Park",
  "description": "Looking for calm dogs to hang out with Max!",
  "organizer_pet_id": "uuid",
  "invited_pet_ids": ["uuid", "uuid"],
  "place_id": "uuid",
  "scheduled_at": "2024-02-04T10:00:00Z",
  "max_pets": 5,
  "is_group": false
}
```

**Validation**
| Field | Rule |
|---|---|
| title | Required, 3–100 chars |
| description | Optional, max 500 chars |
| organizer_pet_id | Required, caller must own it |
| invited_pet_ids | Required, 1–9 pets, must all exist and be active |
| place_id | Optional — either place_id or scheduled_at must be present for non-pending |
| scheduled_at | Optional, must be at least 1 hour in the future |
| max_pets | Optional, 2–20, default 10 |
| is_group | Required boolean |

**Business Rules**
```
1-on-1 meetup (is_group=false):
  - invited_pet_ids must have exactly 1 pet
  - Pets must be FRIENDS (not strangers) OR have mutual friends

Group meetup (is_group=true):
  - invited_pet_ids can have 1–9 pets
  - All invitees must be FRIENDS with organizer pet OR friends of friends
```

**Logic**
```typescript
Deno.serve(async (req) => {
  const user = await getAuthUser(req);
  const body = await req.json();

  // 1. Verify caller owns organizer_pet_id
  await assertPetOwner(supabase, user.id, body.organizer_pet_id);

  // 2. Validate invited pets exist and are not blocked
  for (const petId of body.invited_pet_ids) {
    const blocked = await checkBlocked(body.organizer_pet_id, petId);
    if (blocked) throw new AppError("BLOCKED", `Pet ${petId} is blocked`, 403);
  }

  // 3. Create meetup
  const { data: meetup } = await supabase
    .from("meetups")
    .insert({
      organizer_id: user.id,
      title: body.title,
      description: body.description,
      place_id: body.place_id ?? null,
      scheduled_at: body.scheduled_at ?? null,
      max_pets: body.max_pets ?? 10,
      is_group: body.is_group,
      status: "PENDING"
    })
    .select()
    .single();

  // 4. Add organizer's pet as first participant (ACCEPTED)
  await supabase.from("meetup_participants").insert({
    meetup_id: meetup.id,
    pet_id: body.organizer_pet_id,
    rsvp_status: "ACCEPTED",
    invited_by: user.id
  });

  // 5. Add invited pets as INVITED participants
  const invites = body.invited_pet_ids.map(petId => ({
    meetup_id: meetup.id,
    pet_id: petId,
    rsvp_status: "INVITED",
    invited_by: user.id
  }));
  await supabase.from("meetup_participants").insert(invites);

  // 6. Notify each invited pet's owner
  for (const petId of body.invited_pet_ids) {
    const { data: pet } = await supabase
      .from("pets")
      .select("owner_id, name")
      .eq("id", petId)
      .single();

    await createNotification(supabase, {
      recipient_id: pet.owner_id,
      type: "MEETUP_REQUEST",
      payload: {
        meetup_id: meetup.id,
        meetup_title: meetup.title,
        organizer_pet_id: body.organizer_pet_id,
        invited_pet_id: petId
      }
    });
  }

  return created({ ...meetup, participants: [body.organizer_pet_id, ...body.invited_pet_ids] });
});
```

**Response 201**
```json
{
  "id": "uuid",
  "title": "Sunday Playdate at Dolores Park",
  "description": "Looking for calm dogs to hang out with Max!",
  "organizer_id": "uuid",
  "place_id": "uuid",
  "scheduled_at": "2024-02-04T10:00:00Z",
  "max_pets": 5,
  "is_group": false,
  "status": "PENDING",
  "created_at": "2024-01-28T12:00:00Z",
  "participants": ["uuid", "uuid"]
}
```

---

### GET /meetups/:id `[SDK]`
Get a meetup with full participant details.

```swift
let meetup = try await supabase
    .from("meetups")
    .select("""
        id, title, description, status, scheduled_at,
        max_pets, is_group, created_at,
        organizer:profiles!organizer_id (id, display_name, avatar_url),
        place:places!place_id (id, name, type, address, location),
        meetup_participants (
            id, rsvp_status, joined_at,
            pet:pets!pet_id (
                id, name, breed, avatar_url, temperament, size,
                owner:profiles!owner_id (id, display_name, avatar_url)
            )
        )
    """)
    .eq("id", value: meetupId)
    .single()
    .execute()
```

**Response 200**
```json
{
  "id": "uuid",
  "title": "Sunday Playdate at Dolores Park",
  "description": "Looking for calm dogs to hang out with Max!",
  "status": "SCHEDULED",
  "scheduled_at": "2024-02-04T10:00:00Z",
  "max_pets": 5,
  "is_group": false,
  "created_at": "2024-01-28T12:00:00Z",
  "organizer": {
    "id": "uuid",
    "display_name": "Sarah Connor",
    "avatar_url": "https://..."
  },
  "place": {
    "id": "uuid",
    "name": "Dolores Park",
    "type": "park",
    "address": "Dolores St, San Francisco, CA",
    "location": { "lat": 37.7596, "lng": -122.4269 }
  },
  "participants": [
    {
      "id": "uuid",
      "rsvp_status": "ACCEPTED",
      "joined_at": "2024-01-28T12:00:00Z",
      "pet": {
        "id": "uuid",
        "name": "Max",
        "breed": "Golden Retriever",
        "avatar_url": "https://...",
        "temperament": ["friendly", "high-energy"],
        "size": "large",
        "owner": { "id": "uuid", "display_name": "Sarah Connor", "avatar_url": "https://..." }
      }
    }
  ]
}
```

---

### GET /meetups `[SDK]`
Get meetups for the authenticated user (upcoming + past).

**Query Parameters**
| Param | Type | Default |
|---|---|---|
| status | string | all |
| type | string | all — `upcoming` or `past` |
| limit | int | 20 |
| cursor | timestamptz | null |

```swift
var query = supabase
    .from("meetups")
    .select("""
        id, title, status, scheduled_at, is_group,
        place:places!place_id (id, name, type),
        meetup_participants (
            rsvp_status,
            pet:pets!pet_id (id, name, avatar_url)
        )
    """)
    .or("organizer_id.eq.\(userId),meetup_participants.pet.owner_id.eq.\(userId)")
    .order("scheduled_at", ascending: false)
    .limit(20)

if status != "all" {
    query = query.eq("status", value: status)
}
```

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Sunday Playdate",
      "status": "SCHEDULED",
      "scheduled_at": "2024-02-04T10:00:00Z",
      "is_group": false,
      "place": { "id": "uuid", "name": "Dolores Park", "type": "park" },
      "participants": [
        { "rsvp_status": "ACCEPTED", "pet": { "id": "uuid", "name": "Max", "avatar_url": "https://..." } },
        { "rsvp_status": "ACCEPTED", "pet": { "id": "uuid", "name": "Bella", "avatar_url": "https://..." } }
      ]
    }
  ],
  "next_cursor": "2024-01-20T10:00:00Z"
}
```

---

### PATCH /meetups/:id/schedule `[Edge Function]`
Set or update the date, time, and place for a meetup.

**Edge Function: `schedule-meetup`**

**Request**
```json
{
  "scheduled_at": "2024-02-04T10:00:00Z",
  "place_id": "uuid",
  "custom_location": { "lat": 37.7596, "lng": -122.4269 },
  "custom_address": "Dolores St & 20th St, SF"
}
```

**Validation**
| Rule | Error |
|---|---|
| Caller must be organizer | `AUTH_FORBIDDEN` |
| Meetup status must be PENDING or ACCEPTED | `INVALID_STATE` |
| scheduled_at must be ≥ 1 hour from now | `VALIDATION_ERROR` |
| Either place_id or custom_location required | `VALIDATION_ERROR` |

**Logic**
```typescript
// 1. Verify caller is organizer
// 2. Validate state and time
// 3. Update meetup: scheduled_at, place_id, status → SCHEDULED
// 4. Notify all ACCEPTED participants
await supabase.from("meetups").update({
    scheduled_at: body.scheduled_at,
    place_id: body.place_id ?? null,
    custom_location: body.custom_location
        ? `POINT(${body.custom_location.lng} ${body.custom_location.lat})`
        : null,
    custom_address: body.custom_address ?? null,
    status: "SCHEDULED",
    updated_at: now()
}).eq("id", meetupId);

// Notify all accepted participants except organizer
for (const participant of acceptedParticipants) {
    await createNotification(supabase, {
        recipient_id: participant.owner_id,
        type: "MEETUP_SCHEDULED",
        payload: { meetup_id: meetupId, scheduled_at: body.scheduled_at }
    });
}
```

**Response 200** — updated meetup object

---

### POST /meetups/:id/rsvp `[Edge Function]`
Accept or decline a meetup invitation.

**Edge Function: `rsvp-meetup`**

**Request**
```json
{
  "pet_id": "uuid",
  "rsvp_status": "ACCEPTED"
}
```

Allowed `rsvp_status`: `ACCEPTED`, `DECLINED`

**Validation**
| Rule | Error |
|---|---|
| Caller must own pet_id | `AUTH_FORBIDDEN` |
| pet_id must be an INVITED participant | `NOT_FOUND` |
| Meetup must be PENDING or ACCEPTED | `INVALID_STATE` |
| Meetup must not be full (participant count < max_pets) | `MEETUP_FULL` |

**Logic**
```typescript
// 1. Verify caller owns pet_id
// 2. Fetch participant record — must have rsvp_status=INVITED
// 3. Check meetup is not full (for ACCEPTED)
// 4. Update rsvp_status
// 5. If ACCEPTED and is first acceptance on a 1-on-1: update meetup status to ACCEPTED
// 6. Notify organizer

await supabase.from("meetup_participants")
    .update({ rsvp_status: body.rsvp_status })
    .eq("meetup_id", meetupId)
    .eq("pet_id", body.pet_id);

// For 1-on-1: update meetup status to ACCEPTED when invitee accepts
if (!meetup.is_group && body.rsvp_status === "ACCEPTED") {
    await supabase.from("meetups")
        .update({ status: "ACCEPTED", updated_at: now() })
        .eq("id", meetupId);
}

// Notify organizer
await createNotification(supabase, {
    recipient_id: meetup.organizer_id,
    type: body.rsvp_status === "ACCEPTED" ? "MEETUP_ACCEPTED" : "MEETUP_DECLINED",
    payload: { meetup_id: meetupId, pet_id: body.pet_id }
});
```

**Response 200**
```json
{
  "meetup_id": "uuid",
  "pet_id": "uuid",
  "rsvp_status": "ACCEPTED"
}
```

---

### POST /meetups/:id/invite `[Edge Function]`
Invite additional pets to a group meetup.

**Edge Function: `invite-to-meetup`**

**Request**
```json
{
  "pet_ids": ["uuid", "uuid"]
}
```

**Validation**
| Rule | Error |
|---|---|
| Caller must be organizer | `AUTH_FORBIDDEN` |
| Meetup must be is_group=true | `INVALID_STATE` |
| Meetup status must be PENDING or ACCEPTED | `INVALID_STATE` |
| Total participants + new invites must not exceed max_pets | `MEETUP_FULL` |
| New pets must not already be participants | `DUPLICATE` |

**Response 200**
```json
{ "invited_count": 2 }
```

---

### PATCH /meetups/:id/cancel `[Edge Function]`
Cancel a meetup. Only organizer can cancel.

**Edge Function: `cancel-meetup`**

**Request**
```json
{
  "reason": "Something came up, sorry!"
}
```

**Validation**
| Rule | Error |
|---|---|
| Caller must be organizer | `AUTH_FORBIDDEN` |
| Status must be PENDING, ACCEPTED, or SCHEDULED | `INVALID_STATE` |
| If SCHEDULED: must be > 2 hours before scheduled_at | `TOO_LATE_TO_CANCEL` |

**Logic**
```typescript
// 1. Update status to CANCELLED
// 2. Notify all ACCEPTED participants
// 3. No Neo4j changes needed (no history to undo)
```

**Response 200**
```json
{ "success": true }
```

---

### POST /meetups/:id/complete `[Edge Function]`
Mark a meetup as completed and trigger graph sync. Normally triggered automatically by a scheduled job, but can also be called manually.

**Edge Function: `complete-meetup`**

**Trigger**: Called automatically when `now() > scheduled_at + 2 hours` via Supabase pg_cron job.
Also callable by organizer manually after the meetup.

**Request**
```json
{
  "meetup_id": "uuid"
}
```

**Logic**
```typescript
// 1. Verify meetup is SCHEDULED and scheduled_at has passed
// 2. Update status to COMPLETED
// 3. For each pair of ACCEPTED participants: create/strengthen Neo4j relationships
// 4. If place_id exists: create VISITED edges in Neo4j
// 5. Update compatibility scores between participants
// 6. Notify all participants: prompt for review

const acceptedParticipants = participants.filter(p => p.rsvp_status === "ACCEPTED");
const participantPetIds = acceptedParticipants.map(p => p.pet_id);

// Update Neo4j for each participant
for (const petId of participantPetIds) {
    // Add VISITED relationship to place
    if (meetup.place_id) {
        await neo4jQuery(`
            MATCH (p:Pet {id: $pet_id}), (pl:Place {id: $place_id})
            MERGE (p)-[:VISITED {
                visited_at: $visited_at,
                meetup_id: $meetup_id
            }]->(pl)
        `, { pet_id: petId, place_id: meetup.place_id,
             visited_at: meetup.scheduled_at, meetup_id: meetup.id });
    }
}

// Add MET_AT between all participant pairs
for (let i = 0; i < participantPetIds.length; i++) {
    for (let j = i + 1; j < participantPetIds.length; j++) {
        await neo4jQuery(`
            MATCH (a:Pet {id: $a}), (b:Pet {id: $b}), (pl:Place {id: $place_id})
            MERGE (a)-[:MET_AT {meetup_id: $meetup_id, met_at: $met_at}]->(pl)
            MERGE (b)-[:MET_AT {meetup_id: $meetup_id, met_at: $met_at}]->(pl)
        `, {
            a: participantPetIds[i], b: participantPetIds[j],
            place_id: meetup.place_id ?? "unknown",
            meetup_id: meetup.id, met_at: meetup.scheduled_at
        });
    }
}

// Notify all: prompt for post-meetup review
for (const participant of acceptedParticipants) {
    await createNotification(supabase, {
        recipient_id: participant.owner_id,
        type: "MEETUP_COMPLETED",
        payload: { meetup_id: meetup.id, prompt_review: true }
    });
}
```

**Response 200**
```json
{
  "success": true,
  "participants_synced": 2,
  "neo4j_edges_created": 3
}
```

---

### pg_cron Job: Auto-complete meetups
```sql
-- Run every 15 minutes, complete meetups that ended > 2 hours ago
select cron.schedule(
  'auto-complete-meetups',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := current_setting('app.edge_function_url') || '/complete-meetup',
      body := json_build_object('meetup_id', id)::text,
      headers := json_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type', 'application/json'
      )::jsonb
    )
    from meetups
    where status = 'SCHEDULED'
      and scheduled_at < now() - interval '2 hours';
  $$
);
```

---

## Review Endpoints

### POST /meetups/:id/reviews `[Edge Function]`
Submit a post-meetup review for another pet that attended.

**Edge Function: `submit-meetup-review`**

**Request**
```json
{
  "reviewer_pet_id": "uuid",
  "reviewed_pet_id": "uuid",
  "rating": 5,
  "notes": "Max and Bella had such a great time! Very friendly dog."
}
```

**Validation**
| Field | Rule |
|---|---|
| reviewer_pet_id | Caller must own it, must be ACCEPTED participant |
| reviewed_pet_id | Must be different pet, must be ACCEPTED participant |
| rating | Required, integer 1–5 |
| notes | Optional, max 300 chars |
| Meetup status | Must be COMPLETED |
| Duplicate | One review per reviewer→reviewed pair per meetup |

**Logic**
```typescript
// 1. Verify caller owns reviewer_pet_id
// 2. Verify both pets are ACCEPTED participants in COMPLETED meetup
// 3. Insert meetup_review
// 4. Update compatibility score in Neo4j (positive review → higher score)

const compatibilityBoost = rating >= 4 ? 5 : rating <= 2 ? -5 : 0;
await neo4jQuery(`
    MATCH (a:Pet {id: $a})-[r:FRIENDS_WITH]->(b:Pet {id: $b})
    SET r.compatibility = CASE
        WHEN r.compatibility + $boost > 100 THEN 100
        WHEN r.compatibility + $boost < 0 THEN 0
        ELSE r.compatibility + $boost
    END
`, { a: reviewerPetId, b: reviewedPetId, boost: compatibilityBoost });
```

**Response 201**
```json
{
  "id": "uuid",
  "meetup_id": "uuid",
  "reviewer_pet_id": "uuid",
  "reviewed_pet_id": "uuid",
  "rating": 5,
  "notes": "Max and Bella had such a great time!",
  "created_at": "2024-02-04T14:00:00Z"
}
```

---

### GET /meetups/:id/reviews `[SDK]`
Get all reviews for a meetup.

```swift
let reviews = try await supabase
    .from("meetup_reviews")
    .select("""
        id, rating, notes, created_at,
        reviewer:pets!reviewer_pet_id (id, name, avatar_url),
        reviewed:pets!reviewed_pet_id (id, name, avatar_url)
    """)
    .eq("meetup_id", value: meetupId)
    .execute()
```

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "rating": 5,
      "notes": "Max and Bella had such a great time!",
      "created_at": "2024-02-04T14:00:00Z",
      "reviewer": { "id": "uuid", "name": "Max", "avatar_url": "https://..." },
      "reviewed": { "id": "uuid", "name": "Bella", "avatar_url": "https://..." }
    }
  ]
}
```

---

### GET /pets/:id/reviews `[SDK]`
Get all reviews received by a pet (across all meetups).

```swift
let reviews = try await supabase
    .from("meetup_reviews")
    .select("""
        id, rating, notes, created_at,
        reviewer:pets!reviewer_pet_id (id, name, avatar_url),
        meetup:meetups!meetup_id (id, title, scheduled_at)
    """)
    .eq("reviewed_pet_id", value: petId)
    .order("created_at", ascending: false)
    .execute()
```

**Response 200**
```json
{
  "average_rating": 4.7,
  "total_reviews": 12,
  "data": [
    {
      "id": "uuid",
      "rating": 5,
      "notes": "Such a well-behaved dog!",
      "created_at": "2024-02-04T14:00:00Z",
      "reviewer": { "id": "uuid", "name": "Max", "avatar_url": "https://..." },
      "meetup": { "id": "uuid", "title": "Sunday Playdate", "scheduled_at": "2024-02-04T10:00:00Z" }
    }
  ]
}
```

---

## Realtime: Live RSVP Updates

Organizer sees RSVPs update live while meetup is in PENDING state.

```swift
let channel = supabase.realtimeV2.channel("meetup-rsvp:\(meetupId)")

channel.onPostgresChanges(
    AnyAction.self,
    schema: "public",
    table: "meetup_participants",
    filter: "meetup_id=eq.\(meetupId)"
) { change in
    if case .update(let record) = change {
        updateParticipantStatus(record)
    }
}

await channel.subscribe()
```

---

## Error Reference (this service)

| Code | HTTP | Meaning |
|---|---|---|
| `NOT_FOUND` | 404 | Meetup or participant not found |
| `AUTH_FORBIDDEN` | 403 | Caller is not organizer or pet owner |
| `INVALID_STATE` | 409 | Meetup status does not allow this action |
| `MEETUP_FULL` | 409 | Participant count would exceed max_pets |
| `TOO_LATE_TO_CANCEL` | 409 | Less than 2 hours before scheduled meetup |
| `BLOCKED` | 403 | One of the invited pets is blocked |
| `DUPLICATE` | 409 | Pet already invited or review already submitted |
| `VALIDATION_ERROR` | 400 | Input validation failed |
