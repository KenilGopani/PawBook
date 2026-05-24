# PawBook — Service: Location, Places & Check-ins

## Overview
The location service manages pet-friendly places (parks, cafes, trails), geo-based discovery, and check-ins. PostGIS in Supabase handles all geo queries. Neo4j stores place nodes and `VISITED` relationships for social proof ("your friends have been here"). Location data is privacy-first — owner location is stored at city level by default.

---

## Privacy Model

```
Default (all users):
  - Owner location stored as city string only
  - Geo point (lat/lng) is opt-in

Opt-in (precise location):
  - profiles.location = geography(Point)
  - Used for: nearby pets, meetup suggestions, lost pet alerts
  - Shown to others as: "~500m away" (distance string, not exact coords)
  - Purged if user disables location permission in app

Place locations:
  - Always precise (lat/lng) — needed for maps
  - Public to all authenticated users
```

---

## Place Endpoints

### GET /places/nearby `[Edge Function]`
Find pet-friendly places near a location. Primary discovery endpoint.

**Edge Function: `places-nearby`**

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| lat | float | required | Latitude |
| lng | float | required | Longitude |
| radius_km | int | 10 | Search radius, max 50 |
| type | string | all | park, cafe, trail, beach, vet, groomer |
| tags | string[] | null | off-leash, fenced, water, shade |
| sort | string | distance | distance or rating |
| limit | int | 20 | Max 50 |
| cursor | string | null | Pagination — last place id |

**Logic**
```typescript
Deno.serve(async (req) => {
  const { lat, lng, radius_km = 10, type, tags, sort, limit = 20 } = getQueryParams(req);
  const user = await getAuthUser(req);

  // 1. Build PostGIS geo query
  let query = supabase.rpc("places_nearby", {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radius_km * 1000,
    p_type: type ?? null,
    p_limit: limit
  });

  const { data: places } = await query;

  // 2. Enrich with Neo4j social proof: how many of user's pet-friends visited each place
  const placeIds = places.map(p => p.id);
  const userPetIds = await getOwnerPetIds(supabase, user.id);

  const socialProof = await neo4jQuery(`
    MATCH (friend:Pet)-[:VISITED]->(place:Place)
    WHERE place.id IN $place_ids
      AND EXISTS {
        MATCH (me:Pet)-[:FRIENDS_WITH]->(friend)
        WHERE me.id IN $my_pet_ids
      }
    WITH place.id as place_id, COUNT(DISTINCT friend) as friend_visit_count
    RETURN place_id, friend_visit_count
  `, { place_ids: placeIds, my_pet_ids: userPetIds });

  const socialMap = Object.fromEntries(
    socialProof.map(r => [r.place_id, r.friend_visit_count])
  );

  const enriched = places.map(p => ({
    ...p,
    friends_visited_count: socialMap[p.id] ?? 0
  }));

  return ok({ data: enriched });
});
```

**Supabase RPC function (PostGIS)**
```sql
create or replace function places_nearby(
  p_lat float,
  p_lng float,
  p_radius_m float,
  p_type text default null,
  p_limit int default 20
)
returns table (
  id uuid,
  name text,
  type text,
  address text,
  avg_rating numeric,
  review_count int4,
  tags text[],
  is_verified boolean,
  lat float,
  lng float,
  distance_m float
)
language sql stable as $$
  select
    id, name, type, address, avg_rating, review_count,
    tags, is_verified,
    st_y(location::geometry) as lat,
    st_x(location::geometry) as lng,
    st_distance(location, st_makepoint(p_lng, p_lat)::geography) as distance_m
  from places
  where is_active = true
    and st_dwithin(location, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
    and (p_type is null or type = p_type)
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
      "name": "Dolores Park",
      "type": "park",
      "address": "Dolores St & 19th St, San Francisco, CA",
      "avg_rating": 4.6,
      "review_count": 38,
      "tags": ["off-leash", "fenced", "water", "shade"],
      "is_verified": true,
      "lat": 37.7596,
      "lng": -122.4269,
      "distance_m": 820,
      "distance_label": "820m away",
      "friends_visited_count": 5
    }
  ]
}
```

---

### GET /places/:id `[SDK]`
Get a single place with full detail.

```swift
let place = try await supabase
    .from("places")
    .select("""
        id, name, type, address, avg_rating, review_count,
        tags, is_verified, created_at,
        added_by:profiles!added_by (display_name),
        place_reviews (
            id, rating, body, created_at,
            author:profiles!author_id (display_name, avatar_url)
        )
    """)
    .eq("id", value: placeId)
    .eq("is_active", value: true)
    .single()
    .execute()
```

**Response 200**
```json
{
  "id": "uuid",
  "name": "Dolores Park",
  "type": "park",
  "address": "Dolores St & 19th St, San Francisco, CA",
  "avg_rating": 4.6,
  "review_count": 38,
  "tags": ["off-leash", "fenced", "water", "shade"],
  "is_verified": true,
  "lat": 37.7596,
  "lng": -122.4269,
  "added_by": { "display_name": "Sarah Connor" },
  "reviews": [
    {
      "id": "uuid",
      "rating": 5,
      "body": "Great off-leash area, always clean water bowls!",
      "created_at": "2024-01-10T09:00:00Z",
      "author": { "display_name": "James Wilson", "avatar_url": "https://..." }
    }
  ]
}
```

---

### POST /places `[Edge Function]`
Add a new pet-friendly place.

**Edge Function: `create-place`**

**Request**
```json
{
  "name": "Golden Gate Park Dog Run",
  "type": "park",
  "lat": 37.7694,
  "lng": -122.4862,
  "address": "Fulton St & 38th Ave, San Francisco, CA",
  "tags": ["off-leash", "fenced"]
}
```

**Validation**
| Field | Rule |
|---|---|
| name | Required, 3–100 chars |
| type | Required — park, cafe, trail, beach, vet, groomer, other |
| lat | Required, valid latitude -90 to 90 |
| lng | Required, valid longitude -180 to 180 |
| address | Optional, max 200 chars |
| tags | Optional, values from allowed list |

**Allowed tags**
```
off-leash, fenced, water, shade, parking, indoor,
outdoor-seating, dog-menu, small-dog-area, large-dog-area,
pet-friendly-staff, accepts-all-breeds
```

**Logic**
```typescript
// 1. Check for duplicate place within 100m with same name (prevent spam)
const { data: nearby } = await supabase.rpc("places_nearby", {
    p_lat: body.lat, p_lng: body.lng, p_radius_m: 100
}).eq("name", body.name);

if (nearby.length > 0) throw new AppError("DUPLICATE", "A similar place already exists nearby", 409);

// 2. Insert place
const { data: place } = await supabase.from("places").insert({
    name: body.name,
    type: body.type,
    location: `POINT(${body.lng} ${body.lat})`,
    address: body.address,
    tags: body.tags ?? [],
    added_by: user.id,
    is_verified: false
}).select().single();

// 3. Create Place node in Neo4j
await neo4jQuery(`
    MERGE (pl:Place {id: $id})
    SET pl.name = $name, pl.type = $type,
        pl.lat = $lat, pl.lng = $lng,
        pl.city = $city, pl.avg_rating = 0.0
`, { id: place.id, name: place.name, type: place.type,
     lat: body.lat, lng: body.lng, city: derivedCity });

return created(place);
```

**Response 201**
```json
{
  "id": "uuid",
  "name": "Golden Gate Park Dog Run",
  "type": "park",
  "lat": 37.7694,
  "lng": -122.4862,
  "address": "Fulton St & 38th Ave, San Francisco, CA",
  "tags": ["off-leash", "fenced"],
  "avg_rating": 0,
  "review_count": 0,
  "is_verified": false,
  "created_at": "2024-01-20T10:00:00Z"
}
```

---

### PATCH /places/:id `[SDK]`
Update a place (only the user who added it, or admin).

```swift
try await supabase
    .from("places")
    .update(["name": newName, "tags": newTags, "updated_at": now()])
    .eq("id", value: placeId)
    .execute()
// RLS: only added_by can update
```

**Response 200** — updated place object

---

### POST /places/:id/reviews `[Edge Function]`
Add a review for a place. One review per user per place.

**Edge Function: `review-place`**

**Request**
```json
{
  "rating": 4,
  "body": "Great off-leash area, always lots of dogs!"
}
```

**Validation**
| Field | Rule |
|---|---|
| rating | Required, integer 1–5 |
| body | Optional, max 500 chars |
| Duplicate | One review per user per place (enforced by UNIQUE constraint) |

**Logic**
```typescript
// 1. Upsert review (allow editing own review)
await supabase.from("place_reviews").upsert({
    place_id: placeId,
    author_id: user.id,
    rating: body.rating,
    body: body.body
}, { onConflict: "place_id,author_id" });
// DB trigger auto-updates places.avg_rating
```

**Response 201**
```json
{
  "id": "uuid",
  "place_id": "uuid",
  "rating": 4,
  "body": "Great off-leash area!",
  "created_at": "2024-01-20T10:00:00Z"
}
```

---

### GET /places/:id/checkins `[Edge Function]`
Get recent pet check-ins at a place (from Neo4j VISITED relationships).

**Edge Function: `place-checkins`**

**Query Parameters**
| Param | Type | Default |
|---|---|---|
| limit | int | 20 |
| since_days | int | 30 |

**Neo4j Query**
```cypher
MATCH (p:Pet)-[v:VISITED]->(pl:Place {id: $place_id})
WHERE v.visited_at > $since_date
RETURN p.id as pet_id, p.name, v.visited_at, v.meetup_id
ORDER BY v.visited_at DESC
LIMIT $limit
```

**Logic**
```typescript
// 1. Query Neo4j for VISITED relationships on this place
// 2. Enrich with Supabase pet data (avatar, breed)
// 3. Return enriched check-ins
```

**Response 200**
```json
{
  "data": [
    {
      "pet_id": "uuid",
      "name": "Max",
      "breed": "Golden Retriever",
      "avatar_url": "https://...",
      "visited_at": "2024-01-28T10:00:00Z",
      "meetup_id": "uuid"
    }
  ]
}
```

---

### GET /places/:id/social-proof `[Edge Function]`
Get how many of the caller's friends have visited this place.

**Edge Function: `place-social-proof`**

**Neo4j Query**
```cypher
MATCH (me:Pet)-[:FRIENDS_WITH]->(friend:Pet)-[:VISITED]->(pl:Place {id: $place_id})
WHERE me.id IN $my_pet_ids
WITH friend, MAX(v.visited_at) as last_visit
RETURN friend.id as pet_id, friend.name, last_visit
ORDER BY last_visit DESC
LIMIT 10
```

**Response 200**
```json
{
  "friends_visited_count": 5,
  "friends_preview": [
    { "pet_id": "uuid", "name": "Bella", "avatar_url": "https://...", "last_visit": "2024-01-28T10:00:00Z" },
    { "pet_id": "uuid", "name": "Cooper", "avatar_url": "https://...", "last_visit": "2024-01-25T14:00:00Z" }
  ]
}
```

---

## Place Search

### GET /places/search `[Edge Function]`
Text search for places.

**Edge Function: `search-places`**

**Query Parameters**
| Param | Type | Description |
|---|---|---|
| q | string | Search term |
| lat | float | Optional — bias results toward location |
| lng | float | Optional |
| type | string | Optional type filter |
| limit | int | Default 20 |

**Logic**
```typescript
// Uses pg_trgm index on places.name for fuzzy search
// Combined with optional geo distance bias

const { data } = await supabase.rpc("search_places", {
    p_query: body.q,
    p_lat: body.lat ?? null,
    p_lng: body.lng ?? null,
    p_type: body.type ?? null,
    p_limit: limit
});
```

**Supabase RPC**
```sql
create or replace function search_places(
  p_query text,
  p_lat float default null,
  p_lng float default null,
  p_type text default null,
  p_limit int default 20
)
returns table (
  id uuid, name text, type text, address text,
  avg_rating numeric, tags text[], is_verified boolean,
  lat float, lng float, distance_m float, similarity float
)
language sql stable as $$
  select
    id, name, type, address, avg_rating, tags, is_verified,
    st_y(location::geometry) as lat,
    st_x(location::geometry) as lng,
    case when p_lat is not null
      then st_distance(location, st_makepoint(p_lng, p_lat)::geography)
      else null end as distance_m,
    similarity(name, p_query) as similarity
  from places
  where is_active = true
    and (p_type is null or type = p_type)
    and name % p_query  -- pg_trgm similarity match
  order by
    case when p_lat is not null
      then st_distance(location, st_makepoint(p_lng, p_lat)::geography)
      else 0 end asc,
    similarity desc
  limit p_limit;
$$;
```

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Dolores Park",
      "type": "park",
      "address": "Dolores St, San Francisco",
      "avg_rating": 4.6,
      "tags": ["off-leash", "fenced"],
      "lat": 37.7596,
      "lng": -122.4269,
      "distance_m": 820,
      "similarity": 0.92
    }
  ]
}
```

---

## User Location Endpoints

### POST /location/update `[Edge Function]`
Update caller's location. Opt-in, precise.

**Edge Function: `update-location`**

**Request**
```json
{
  "lat": 37.7749,
  "lng": -122.4194,
  "city": "San Francisco"
}
```

**Logic**
```typescript
// 1. Validate lat/lng ranges
// 2. Update profiles.location (PostGIS point) and city
// 3. Sync to Neo4j Owner node (lat, lng, city)
// 4. Never log or store location history — overwrite only

await supabase.from("profiles").update({
    location: `POINT(${body.lng} ${body.lat})`,
    city: body.city,
    updated_at: now()
}).eq("id", user.id);

await neo4jQuery(`
    MERGE (o:Owner {id: $owner_id})
    SET o.lat = $lat, o.lng = $lng, o.city = $city
    WITH o
    MATCH (o)-[:OWNS]->(p:Pet)
    SET p.lat = $lat, p.lng = $lng, p.city = $city
`, { owner_id: user.id, lat: body.lat, lng: body.lng, city: body.city });
```

**Response 200**
```json
{ "success": true }
```

---

### DELETE /location `[SDK]`
Remove precise location (revert to city-only).

```swift
try await supabase
    .from("profiles")
    .update(["location": nil, "updated_at": now()])
    .eq("id", value: userId)
    .execute()
```

**Response 200**
```json
{ "success": true }
```

---

### GET /location/nearby-pets `[Edge Function]`
Find pet owners near the caller's current location.

**Edge Function: `nearby-pets`**

**Query Parameters**
| Param | Type | Default |
|---|---|---|
| lat | float | required |
| lng | float | required |
| radius_km | int | 5 |
| species | string | null |
| limit | int | 30 |

**Logic**
```typescript
// 1. Find profiles with precise location within radius (PostGIS)
// 2. Join to their active pets
// 3. Exclude caller's own pets
// 4. Exclude blocked pets (check pet_relationships)
// 5. Return distance as label string (not exact coords) for privacy

const { data } = await supabase.rpc("nearby_pet_owners", {
    p_lat: lat, p_lng: lng,
    p_radius_m: radius_km * 1000,
    p_limit: limit
});
```

**Supabase RPC**
```sql
create or replace function nearby_pet_owners(
  p_lat float, p_lng float,
  p_radius_m float, p_limit int
)
returns table (
  owner_id uuid, display_name text, avatar_url text,
  city text, distance_m float,
  pet_id uuid, pet_name text, pet_breed text, pet_avatar_url text,
  pet_species text, pet_temperament text[], pet_size text
)
language sql stable as $$
  select
    pr.id as owner_id, pr.display_name, pr.avatar_url, pr.city,
    st_distance(pr.location, st_makepoint(p_lng, p_lat)::geography) as distance_m,
    p.id as pet_id, p.name as pet_name, p.breed as pet_breed,
    p.avatar_url as pet_avatar_url, p.species as pet_species,
    p.temperament as pet_temperament, p.size as pet_size
  from profiles pr
  join pets p on p.owner_id = pr.id
  where pr.location is not null
    and st_dwithin(pr.location, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
    and p.is_active = true
    and pr.is_active = true
  order by distance_m asc
  limit p_limit;
$$;
```

**Response 200**
```json
{
  "data": [
    {
      "owner": {
        "id": "uuid",
        "display_name": "James Wilson",
        "avatar_url": "https://...",
        "city": "San Francisco",
        "distance_label": "~400m away"
      },
      "pets": [
        {
          "id": "uuid",
          "name": "Bella",
          "breed": "Labrador",
          "avatar_url": "https://...",
          "species": "dog",
          "temperament": ["friendly", "calm"],
          "size": "large"
        }
      ]
    }
  ]
}
```

---

## Distance Label Helper

Raw `distance_m` from PostGIS is converted to a human label before sending to iOS:

```typescript
function distanceLabel(metres: number): string {
  if (metres < 100) return "Nearby";
  if (metres < 1000) return `~${Math.round(metres / 100) * 100}m away`;
  const km = metres / 1000;
  if (km < 10) return `~${km.toFixed(1)}km away`;
  return `~${Math.round(km)}km away`;
}
```

---

## Error Reference (this service)

| Code | HTTP | Meaning |
|---|---|---|
| `NOT_FOUND` | 404 | Place not found or inactive |
| `DUPLICATE` | 409 | Similar place already exists nearby |
| `VALIDATION_ERROR` | 400 | Invalid lat/lng or missing required field |
| `INVALID_TAG` | 400 | Tag not in allowed list |
| `LOCATION_DISABLED` | 403 | User has not enabled precise location |
| `AUTH_FORBIDDEN` | 403 | Caller did not add this place |
