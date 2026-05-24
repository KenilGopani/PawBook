# PawBook — Service: Alerts, Safety & Moderation

## Overview
The alerts service handles three safety layers: lost pet reports, community incident alerts (dangerous animals, park hazards), and user-submitted moderation reports. Lost pet alerts and community alerts use PostGIS geofencing to notify nearby users in real time via Supabase Realtime + push notifications. This is the most viral feature — notifications go out to all users within the alert radius instantly.

---

## Lost Pet Alerts

### POST /alerts/lost-pet `[Edge Function]`
Report a lost pet. Triggers immediate push notifications to all users within radius.

**Edge Function: `create-lost-pet-alert`**

**Request**
```json
{
  "pet_id": "uuid",
  "last_seen_lat": 37.7596,
  "last_seen_lng": -122.4269,
  "last_seen_at": "2024-01-28T14:30:00Z",
  "description": "Max ran off near the park entrance, wearing a red collar",
  "contact_info": "+1-555-0123",
  "photo_url": "https://...supabase.co/storage/v1/object/public/lost-pets/uuid/photo.jpg",
  "notify_radius_km": 3
}
```

**Validation**
| Field | Rule |
|---|---|
| pet_id | Required, caller must own it, pet must be active |
| last_seen_lat / lng | Required, valid coordinates |
| last_seen_at | Required, must be within the last 7 days |
| description | Required, 10–500 chars |
| contact_info | Required, max 200 chars |
| photo_url | Optional, must be Supabase Storage URL |
| notify_radius_km | Optional, 1–10, default 3 |

**Logic**
```typescript
Deno.serve(async (req) => {
  const user = await getAuthUser(req);
  const body = await req.json();

  // 1. Verify caller owns pet
  await assertPetOwner(supabase, user.id, body.pet_id);

  // 2. Check no active alert for this pet already
  const { data: existing } = await supabase
    .from("lost_pet_alerts")
    .select("id")
    .eq("pet_id", body.pet_id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (existing) throw new AppError("DUPLICATE", "An active alert already exists for this pet", 409);

  // 3. Create alert
  const { data: alert } = await supabase
    .from("lost_pet_alerts")
    .insert({
      pet_id: body.pet_id,
      reporter_id: user.id,
      last_seen_location: `POINT(${body.last_seen_lng} ${body.last_seen_lat})`,
      last_seen_at: body.last_seen_at,
      description: body.description,
      contact_info: body.contact_info,
      photo_url: body.photo_url ?? null,
      status: "ACTIVE"
    })
    .select()
    .single();

  // 4. Find all users within radius using PostGIS
  const { data: nearbyUsers } = await supabase.rpc("users_within_radius", {
    p_lat: body.last_seen_lat,
    p_lng: body.last_seen_lng,
    p_radius_m: (body.notify_radius_km ?? 3) * 1000
  });

  // 5. Batch-insert notifications for all nearby users (excluding reporter)
  const notifications = nearbyUsers
    .filter(u => u.id !== user.id)
    .map(u => ({
      recipient_id: u.id,
      type: "LOST_PET_NEARBY",
      payload: {
        alert_id: alert.id,
        pet_id: body.pet_id,
        pet_name: petData.name,
        last_seen_lat: body.last_seen_lat,
        last_seen_lng: body.last_seen_lng,
        description: body.description,
        photo_url: body.photo_url
      }
    }));

  // Insert in batches of 500
  for (let i = 0; i < notifications.length; i += 500) {
    await supabase.from("notifications").insert(notifications.slice(i, i + 500));
  }

  return created({ alert, notified_count: notifications.length });
});
```

**PostGIS RPC: users_within_radius**
```sql
create or replace function users_within_radius(
  p_lat float,
  p_lng float,
  p_radius_m float
)
returns table (id uuid)
language sql stable as $$
  select id from profiles
  where is_active = true
    and location is not null
    and st_dwithin(
      location,
      st_makepoint(p_lng, p_lat)::geography,
      p_radius_m
    );
$$;
```

**Response 201**
```json
{
  "alert": {
    "id": "uuid",
    "pet_id": "uuid",
    "last_seen_lat": 37.7596,
    "last_seen_lng": -122.4269,
    "last_seen_at": "2024-01-28T14:30:00Z",
    "description": "Max ran off near the park entrance, wearing a red collar",
    "contact_info": "+1-555-0123",
    "photo_url": "https://...",
    "status": "ACTIVE",
    "created_at": "2024-01-28T14:35:00Z"
  },
  "notified_count": 247
}
```

---

### GET /alerts/lost-pet/nearby `[Edge Function]`
Get active lost pet alerts near a location.

**Edge Function: `lost-pets-nearby`**

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| lat | float | required | Latitude |
| lng | float | required | Longitude |
| radius_km | int | 5 | Search radius |
| limit | int | 20 | Max 50 |

**Logic**
```typescript
const { data: alerts } = await supabase.rpc("lost_pets_nearby", {
    p_lat: lat, p_lng: lng,
    p_radius_m: radius_km * 1000,
    p_limit: limit
});
```

**Supabase RPC**
```sql
create or replace function lost_pets_nearby(
  p_lat float, p_lng float,
  p_radius_m float, p_limit int default 20
)
returns table (
  id uuid, pet_id uuid, description text, contact_info text,
  photo_url text, last_seen_at timestamptz, status text,
  last_seen_lat float, last_seen_lng float, distance_m float
)
language sql stable as $$
  select
    id, pet_id, description, contact_info, photo_url,
    last_seen_at, status,
    st_y(last_seen_location::geometry) as last_seen_lat,
    st_x(last_seen_location::geometry) as last_seen_lng,
    st_distance(last_seen_location, st_makepoint(p_lng, p_lat)::geography) as distance_m
  from lost_pet_alerts
  where status = 'ACTIVE'
    and st_dwithin(
      last_seen_location,
      st_makepoint(p_lng, p_lat)::geography,
      p_radius_m
    )
  order by distance_m asc
  limit p_limit;
$$;
```

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "pet_id": "uuid",
      "pet": {
        "name": "Max",
        "breed": "Golden Retriever",
        "avatar_url": "https://...",
        "temperament": ["friendly"],
        "size": "large"
      },
      "description": "Max ran off near the park entrance, wearing a red collar",
      "contact_info": "+1-555-0123",
      "photo_url": "https://...",
      "last_seen_at": "2024-01-28T14:30:00Z",
      "last_seen_lat": 37.7596,
      "last_seen_lng": -122.4269,
      "distance_m": 420,
      "distance_label": "~400m away",
      "status": "ACTIVE"
    }
  ]
}
```

---

### PATCH /alerts/lost-pet/:id/resolve `[SDK]`
Mark a lost pet as found.

```swift
try await supabase
    .from("lost_pet_alerts")
    .update(["status": "RESOLVED", "updated_at": now()])
    .eq("id", value: alertId)
    .execute()
// RLS: only reporter_id can update
```

**Response 200**
```json
{ "success": true, "status": "RESOLVED" }
```

---

### GET /alerts/lost-pet/mine `[SDK]`
Get the authenticated user's own lost pet alerts.

```swift
let alerts = try await supabase
    .from("lost_pet_alerts")
    .select("""
        id, status, description, last_seen_at, created_at,
        pet:pets!pet_id (id, name, breed, avatar_url)
    """)
    .eq("reporter_id", value: userId)
    .order("created_at", ascending: false)
    .execute()
```

**Response 200** — array of alert objects

---

### POST /alerts/lost-pet/:id/sighting `[Edge Function]`
Report a sighting of a lost pet (community help).

**Edge Function: `report-sighting`**

**Request**
```json
{
  "lat": 37.7610,
  "lng": -122.4250,
  "note": "Saw this dog running east on 18th St about 10 minutes ago"
}
```

**Logic**
```typescript
// 1. Verify alert is ACTIVE
// 2. Insert sighting notification to alert reporter
// 3. No stored sighting table at MVP — just notification payload

await createNotification(supabase, {
    recipient_id: alert.reporter_id,
    type: "PET_SIGHTING",
    payload: {
        alert_id: alertId,
        sighting_lat: body.lat,
        sighting_lng: body.lng,
        note: body.note,
        reporter_display_name: user.display_name
    }
});
```

**Response 200**
```json
{ "success": true, "message": "Sighting reported to the pet owner" }
```

---

## Community Alerts

### POST /alerts/community `[Edge Function]`
Post a community safety alert (dangerous dog, wildlife, etc.).

**Edge Function: `create-community-alert`**

**Request**
```json
{
  "alert_type": "DANGEROUS_DOG",
  "lat": 37.7596,
  "lng": -122.4269,
  "radius_km": 2,
  "description": "Aggressive off-leash dog near the east entrance, black lab mix",
  "expires_hours": 4
}
```

**Validation**
| Field | Rule |
|---|---|
| alert_type | Required — DANGEROUS_DOG, WILDLIFE, THEFT, LOST_ITEM, OTHER |
| lat / lng | Required, valid coordinates |
| radius_km | 1–10, default 2 |
| description | Required, 10–300 chars |
| expires_hours | 1–48, default 4 |

**Rate limit**: Max 3 community alerts per user per 24 hours (prevent spam).

**Logic**
```typescript
// 1. Check rate limit (count alerts from this user in last 24h)
const { count } = await supabase
    .from("community_alerts")
    .select("id", { count: "exact" })
    .eq("reporter_id", user.id)
    .gte("created_at", new Date(Date.now() - 86400000).toISOString());

if (count >= 3) throw new AppError("RATE_LIMITED", "Max 3 alerts per 24 hours", 429);

// 2. Insert alert
const expiresAt = new Date(Date.now() + body.expires_hours * 3600000).toISOString();

const { data: alert } = await supabase
    .from("community_alerts")
    .insert({
        reporter_id: user.id,
        alert_type: body.alert_type,
        location: `POINT(${body.lng} ${body.lat})`,
        radius_km: body.radius_km ?? 2,
        description: body.description,
        expires_at: expiresAt,
        is_active: true
    })
    .select()
    .single();

// 3. Notify nearby users
const { data: nearbyUsers } = await supabase.rpc("users_within_radius", {
    p_lat: body.lat, p_lng: body.lng,
    p_radius_m: (body.radius_km ?? 2) * 1000
});

const notifications = nearbyUsers
    .filter(u => u.id !== user.id)
    .map(u => ({
        recipient_id: u.id,
        type: "COMMUNITY_ALERT",
        payload: {
            alert_id: alert.id,
            alert_type: body.alert_type,
            lat: body.lat, lng: body.lng,
            description: body.description,
            expires_at: expiresAt
        }
    }));

for (let i = 0; i < notifications.length; i += 500) {
    await supabase.from("notifications").insert(notifications.slice(i, i + 500));
}

return created({ alert, notified_count: notifications.length });
```

**Response 201**
```json
{
  "alert": {
    "id": "uuid",
    "alert_type": "DANGEROUS_DOG",
    "lat": 37.7596,
    "lng": -122.4269,
    "radius_km": 2,
    "description": "Aggressive off-leash dog near the east entrance",
    "expires_at": "2024-01-28T18:30:00Z",
    "is_active": true,
    "created_at": "2024-01-28T14:30:00Z"
  },
  "notified_count": 89
}
```

---

### GET /alerts/community/nearby `[Edge Function]`
Get active community alerts near a location.

**Query Parameters**
| Param | Type | Default |
|---|---|---|
| lat | float | required |
| lng | float | required |
| radius_km | int | 5 |

**Logic**
```typescript
const { data } = await supabase.rpc("community_alerts_nearby", {
    p_lat: lat, p_lng: lng, p_radius_m: radius_km * 1000
});
// Only returns is_active=true AND expires_at > now() (enforced by RLS and RPC)
```

**Supabase RPC**
```sql
create or replace function community_alerts_nearby(
  p_lat float, p_lng float, p_radius_m float
)
returns table (
  id uuid, alert_type text, description text,
  radius_km numeric, expires_at timestamptz,
  lat float, lng float, distance_m float,
  reporter_display_name text, created_at timestamptz
)
language sql stable as $$
  select
    ca.id, ca.alert_type, ca.description, ca.radius_km, ca.expires_at,
    st_y(ca.location::geometry) as lat,
    st_x(ca.location::geometry) as lng,
    st_distance(ca.location, st_makepoint(p_lng, p_lat)::geography) as distance_m,
    pr.display_name as reporter_display_name,
    ca.created_at
  from community_alerts ca
  join profiles pr on pr.id = ca.reporter_id
  where ca.is_active = true
    and ca.expires_at > now()
    and st_dwithin(ca.location, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
  order by distance_m asc;
$$;
```

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "alert_type": "DANGEROUS_DOG",
      "description": "Aggressive off-leash dog near the east entrance",
      "radius_km": 2,
      "expires_at": "2024-01-28T18:30:00Z",
      "lat": 37.7596,
      "lng": -122.4269,
      "distance_m": 320,
      "distance_label": "~300m away",
      "reporter_display_name": "James Wilson",
      "created_at": "2024-01-28T14:30:00Z"
    }
  ]
}
```

---

### PATCH /alerts/community/:id/deactivate `[SDK]`
Deactivate your own alert early (situation resolved).

```swift
try await supabase
    .from("community_alerts")
    .update(["is_active": false])
    .eq("id", value: alertId)
    .execute()
// RLS: only reporter can deactivate
```

**Response 200**
```json
{ "success": true }
```

---

### pg_cron Job: Auto-expire community alerts
```sql
select cron.schedule(
  'expire-community-alerts',
  '*/15 * * * *',
  $$
    update community_alerts
    set is_active = false
    where is_active = true
      and expires_at < now();
  $$
);
```

---

## Moderation & Reports

### POST /reports `[Edge Function]`
Submit a moderation report for a post, comment, profile, pet, or place.

**Edge Function: `submit-report`**

**Request**
```json
{
  "target_type": "post",
  "target_id": "uuid",
  "reason": "INAPPROPRIATE_CONTENT",
  "details": "This post contains offensive language"
}
```

**Validation**
| Field | Rule |
|---|---|
| target_type | Required — profile, pet, post, comment, place |
| target_id | Required UUID, target must exist |
| reason | Required — see allowed reasons below |
| details | Optional, max 500 chars |

**Allowed reasons**
```
INAPPROPRIATE_CONTENT
SPAM
HARASSMENT
FAKE_PROFILE
ANIMAL_ABUSE
DANGEROUS_CONTENT
OTHER
```

**Rate limit**: Max 10 reports per user per hour.

**Logic**
```typescript
// 1. Rate limit check
// 2. Verify target exists (query appropriate table by target_type)
// 3. Prevent self-reporting
// 4. Insert report
// 5. Auto-flag: if target receives 5+ reports with same reason in 24h,
//    set a flag on the target for admin review queue

const { count: reportCount } = await supabase
    .from("reports")
    .select("id", { count: "exact" })
    .eq("target_type", body.target_type)
    .eq("target_id", body.target_id)
    .eq("reason", body.reason)
    .gte("created_at", twentyFourHoursAgo);

if (reportCount >= 5) {
    // Auto-flag the target content for admin review
    // Implementation depends on target_type
    // e.g. for posts: update posts set flagged_for_review = true
}
```

**Response 201**
```json
{
  "id": "uuid",
  "target_type": "post",
  "target_id": "uuid",
  "reason": "INAPPROPRIATE_CONTENT",
  "status": "PENDING",
  "created_at": "2024-01-28T15:00:00Z"
}
```

---

### GET /reports/mine `[SDK]`
Get the authenticated user's submitted reports.

```swift
let reports = try await supabase
    .from("reports")
    .select("id, target_type, target_id, reason, status, created_at")
    .eq("reporter_id", value: userId)
    .order("created_at", ascending: false)
    .execute()
// RLS: users only see their own reports
```

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "target_type": "post",
      "target_id": "uuid",
      "reason": "SPAM",
      "status": "REVIEWED",
      "created_at": "2024-01-25T10:00:00Z"
    }
  ]
}
```

---

## Realtime: Live Alert Subscription

iOS app subscribes to nearby alerts on app foreground. Implemented via Supabase Realtime on the notifications table (alert-type notifications).

```swift
// Subscribe to incoming alert notifications
let channel = supabase.realtimeV2.channel("alerts:\(userId)")

channel.onPostgresChanges(
    AnyAction.self,
    schema: "public",
    table: "notifications",
    filter: "recipient_id=eq.\(userId)"
) { change in
    if case .insert(let record) = change {
        switch record.type {
        case "LOST_PET_NEARBY":
            showLostPetAlert(record.payload)
        case "COMMUNITY_ALERT":
            showCommunityAlert(record.payload)
        case "PET_SIGHTING":
            showSightingNotification(record.payload)
        default: break
        }
    }
}

await channel.subscribe()
```

---

## Push Notification Payloads (APNs)

Sent via Supabase Edge Function calling APNs HTTP/2 API after inserting notifications.

**Lost pet alert**
```json
{
  "aps": {
    "alert": {
      "title": "🚨 Lost Pet Nearby",
      "body": "Max (Golden Retriever) was last seen ~400m from you. Can you help?"
    },
    "sound": "default",
    "badge": 1,
    "category": "LOST_PET"
  },
  "alert_id": "uuid",
  "type": "LOST_PET_NEARBY"
}
```

**Community alert**
```json
{
  "aps": {
    "alert": {
      "title": "⚠️ Safety Alert Nearby",
      "body": "Aggressive off-leash dog reported ~300m away. Stay alert."
    },
    "sound": "default",
    "category": "COMMUNITY_ALERT"
  },
  "alert_id": "uuid",
  "type": "COMMUNITY_ALERT"
}
```

---

## Error Reference (this service)

| Code | HTTP | Meaning |
|---|---|---|
| `NOT_FOUND` | 404 | Alert or target does not exist |
| `AUTH_FORBIDDEN` | 403 | Caller does not own this pet or alert |
| `DUPLICATE` | 409 | Active alert already exists for this pet |
| `RATE_LIMITED` | 429 | Too many alerts or reports submitted recently |
| `VALIDATION_ERROR` | 400 | Missing or invalid fields |
| `INVALID_REASON` | 400 | Report reason not in allowed list |
| `SELF_REPORT` | 400 | Cannot report your own content |
| `ALERT_EXPIRED` | 409 | Alert is no longer active |
