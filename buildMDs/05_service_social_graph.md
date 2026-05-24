# PawBook — Service: Social Graph

## Overview
The social graph service manages all pet-to-pet relationships, friend discovery, and compatibility matching. Simple read queries (direct friends list) use Supabase SDK directly. Any traversal query (friends-of-friends, suggestions, compatibility) is routed through an Edge Function that queries Neo4j.

---

## Relationship State Machine

```
No relationship
  └── A sends request ──► SENT_REQUEST_TO (Neo4j) + FRIEND_REQ (Supabase)
        └── B accepts  ──► FRIENDS_WITH (Neo4j) + FRIEND (Supabase)
        └── B declines ──► relationship deleted (both DBs)
        └── A cancels  ──► relationship deleted (both DBs)

FRIENDS_WITH
  └── Either blocks ──► BLOCKED (both DBs) + FRIENDS_WITH deleted
```

---

## Friend Request Endpoints

### POST /relationships/request `[Edge Function]`
Send a friend request from one of the caller's pets to another pet.

**Edge Function: `send-friend-request`**

**Request**
```json
{
  "from_pet_id": "uuid",
  "to_pet_id": "uuid"
}
```

**Validation**
| Rule | Error |
|---|---|
| `from_pet_id` must belong to caller | `AUTH_FORBIDDEN` |
| `to_pet_id` must exist and be active | `NOT_FOUND` |
| Must not already be friends | `ALREADY_FRIENDS` |
| Must not be blocked in either direction | `BLOCKED` |
| Must not have a pending request already | `REQUEST_PENDING` |
| Cannot request yourself (same owner) | `INVALID_REQUEST` |

**Edge Function Logic**
```typescript
Deno.serve(async (req) => {
  const user = await getAuthUser(req);
  const { from_pet_id, to_pet_id } = await req.json();

  // 1. Verify caller owns from_pet_id
  await assertPetOwner(supabase, user.id, from_pet_id);

  // 2. Check for existing relationship
  const { data: existing } = await supabase
    .from("pet_relationships")
    .select("rel_type")
    .or(`and(from_pet_id.eq.${from_pet_id},to_pet_id.eq.${to_pet_id}),and(from_pet_id.eq.${to_pet_id},to_pet_id.eq.${from_pet_id})`)
    .maybeSingle();

  if (existing?.rel_type === "FRIEND") throw new AppError("ALREADY_FRIENDS", 409);
  if (existing?.rel_type === "BLOCKED") throw new AppError("BLOCKED", 403);
  if (existing?.rel_type === "FRIEND_REQ") throw new AppError("REQUEST_PENDING", 409);

  // 3. Insert into Supabase
  const { data: rel } = await supabase
    .from("pet_relationships")
    .insert({
      from_pet_id,
      to_pet_id,
      rel_type: "FRIEND_REQ"
    })
    .select()
    .single();

  // 4. Create pending edge in Neo4j
  await neo4jQuery(`
    MATCH (a:Pet {id: $from_pet_id}), (b:Pet {id: $to_pet_id})
    MERGE (a)-[:SENT_REQUEST_TO {created_at: $created_at}]->(b)
  `, { from_pet_id, to_pet_id, created_at: rel.created_at });

  // 5. Notify to_pet owner
  const { data: toPet } = await supabase
    .from("pets")
    .select("owner_id, name, profiles!owner_id(id)")
    .eq("id", to_pet_id)
    .single();

  await createNotification(supabase, {
    recipient_id: toPet.owner_id,
    type: "FRIEND_REQUEST",
    payload: { from_pet_id, to_pet_id, from_pet_name: fromPet.name }
  });

  return created(rel);
});
```

**Response 201**
```json
{
  "id": "uuid",
  "from_pet_id": "uuid",
  "to_pet_id": "uuid",
  "rel_type": "FRIEND_REQ",
  "created_at": "2024-01-15T10:00:00Z"
}
```

---

### POST /relationships/accept `[Edge Function]`
Accept a pending friend request.

**Edge Function: `accept-friend-request`**

**Request**
```json
{
  "relationship_id": "uuid",
  "accepting_pet_id": "uuid"
}
```

**Logic**
```typescript
// 1. Verify caller owns accepting_pet_id
// 2. Fetch relationship — must be FRIEND_REQ and to_pet_id = accepting_pet_id
// 3. Compute compatibility score via Neo4j
// 4. Update Supabase: rel_type = FRIEND
// 5. In Neo4j:
//    - Delete SENT_REQUEST_TO
//    - Create FRIENDS_WITH both directions with compatibility score
// 6. Notify requester: FRIEND_ACCEPTED

const compatibility = await computeCompatibility(from_pet_id, accepting_pet_id);

await supabase.from("pet_relationships")
  .update({ rel_type: "FRIEND", compatibility, updated_at: now() })
  .eq("id", relationship_id);

await neo4jQuery(`
  MATCH (a:Pet {id: $from_pet_id}), (b:Pet {id: $to_pet_id})
  OPTIONAL MATCH (a)-[r:SENT_REQUEST_TO]->(b) DELETE r
  MERGE (a)-[f1:FRIENDS_WITH]->(b)
  SET f1.since = $since, f1.compatibility = $score
  MERGE (b)-[f2:FRIENDS_WITH]->(a)
  SET f2.since = $since, f2.compatibility = $score
`, { from_pet_id, to_pet_id: accepting_pet_id, since: now(), score: compatibility });
```

**Response 200**
```json
{
  "id": "uuid",
  "from_pet_id": "uuid",
  "to_pet_id": "uuid",
  "rel_type": "FRIEND",
  "compatibility": 82,
  "created_at": "2024-01-15T10:00:00Z"
}
```

---

### POST /relationships/decline `[Edge Function]`
Decline or cancel a friend request.

**Edge Function: `decline-friend-request`**

**Request**
```json
{
  "relationship_id": "uuid",
  "pet_id": "uuid"
}
```

**Logic**
```typescript
// Either side (requester cancels OR receiver declines)
// 1. Verify caller owns pet_id which is either from_pet or to_pet
// 2. Delete from Supabase pet_relationships
// 3. Delete SENT_REQUEST_TO from Neo4j
// No notification sent for decline (avoids awkwardness)
```

**Response 200**
```json
{ "success": true }
```

---

### POST /relationships/block `[Edge Function]`
Block a pet. Enforced immediately in Supabase (via RLS), then synced to Neo4j.

**Edge Function: `block-pet`**

**Request**
```json
{
  "from_pet_id": "uuid",
  "to_pet_id": "uuid"
}
```

**Logic**
```typescript
// 1. Verify caller owns from_pet_id
// 2. Delete any existing relationship in Supabase (friendship or request)
// 3. Insert BLOCKED relationship in Supabase
// 4. In Neo4j: delete FRIENDS_WITH both directions, create BLOCKED
// 5. No notification sent
```

**Response 200**
```json
{ "success": true }
```

---

### DELETE /relationships/block `[Edge Function]`
Unblock a pet.

**Request**
```json
{
  "from_pet_id": "uuid",
  "to_pet_id": "uuid"
}
```

**Logic**
```typescript
// 1. Verify caller owns from_pet_id
// 2. Delete BLOCKED from Supabase
// 3. Delete BLOCKED from Neo4j
```

**Response 200**
```json
{ "success": true }
```

---

## Friends List Endpoints

### GET /pets/:id/friends `[SDK]`
Get all confirmed friends of a pet.

```swift
let friends = try await supabase
    .from("pet_relationships")
    .select("""
        id, compatibility, created_at,
        to_pet:pets!to_pet_id (
            id, name, species, breed, avatar_url,
            temperament, size, is_vaccinated,
            profiles!owner_id (display_name, city)
        )
    """)
    .eq("from_pet_id", value: petId)
    .eq("rel_type", value: "FRIEND")
    .order("created_at", ascending: false)
    .execute()
```

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "compatibility": 82,
      "created_at": "2024-01-15T10:00:00Z",
      "friend_pet": {
        "id": "uuid",
        "name": "Bella",
        "species": "dog",
        "breed": "Labrador",
        "avatar_url": "https://...",
        "temperament": ["friendly", "calm"],
        "size": "large",
        "is_vaccinated": true,
        "owner": {
          "display_name": "James Wilson",
          "city": "San Francisco"
        }
      }
    }
  ]
}
```

---

### GET /pets/:id/requests `[SDK]`
Get pending friend requests (incoming) for a pet.

```swift
let requests = try await supabase
    .from("pet_relationships")
    .select("""
        id, created_at,
        from_pet:pets!from_pet_id (
            id, name, species, breed, avatar_url, temperament,
            profiles!owner_id (display_name, avatar_url, city)
        )
    """)
    .eq("to_pet_id", value: petId)
    .eq("rel_type", value: "FRIEND_REQ")
    .order("created_at", ascending: false)
    .execute()
```

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "created_at": "2024-01-20T09:00:00Z",
      "from_pet": {
        "id": "uuid",
        "name": "Cooper",
        "species": "dog",
        "breed": "Beagle",
        "avatar_url": "https://...",
        "temperament": ["friendly", "playful"],
        "owner": {
          "display_name": "Emily Chen",
          "avatar_url": "https://...",
          "city": "San Francisco"
        }
      }
    }
  ]
}
```

---

## Discovery Endpoints (Neo4j-powered)

### GET /discover/nearby `[Edge Function]`
Find pets near the caller. Uses Neo4j for relationship filtering + city matching.

**Edge Function: `discover-nearby`**

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| pet_id | uuid | required | Which of caller's pets to discover for |
| species | string | null | Filter by species |
| radius_km | int | 10 | Search radius (used for geo filter in Supabase join) |
| limit | int | 30 | Max results |

**Logic**
```typescript
// 1. Get caller's pet and location from Supabase
// 2. Query Neo4j for pets in same city, excluding friends and blocked
// 3. Enrich with Supabase data (avatar, vaccination status)
// 4. Sort by: friends_in_common DESC, compatibility DESC

const neo4jResult = await neo4jQuery(`
  MATCH (me:Pet {id: $pet_id})
  MATCH (other:Pet)
  WHERE other.city = me.city
    AND other.id <> $pet_id
    AND other.species = me.species
    AND NOT (me)-[:BLOCKED]-(other)
    AND NOT (me)-[:FRIENDS_WITH]-(other)
    AND NOT (me)-[:SENT_REQUEST_TO]->(other)
  WITH me, other,
       COUNT { (me)-[:FRIENDS_WITH]->()-[:FRIENDS_WITH]->(other) } as mutual_count,
       SIZE([t IN other.temperament WHERE t IN me.temperament]) as shared_traits
  ORDER BY mutual_count DESC, shared_traits DESC
  RETURN other.id as pet_id, mutual_count, shared_traits
  LIMIT $limit
`, { pet_id, limit });

// Enrich with Supabase pet details
const petIds = neo4jResult.map(r => r.pet_id);
const { data: pets } = await supabase
    .from("pets")
    .select("id, name, breed, avatar_url, temperament, size, is_vaccinated, profiles!owner_id(display_name, city)")
    .in("id", petIds)
    .eq("is_active", true);
```

**Response 200**
```json
{
  "data": [
    {
      "pet_id": "uuid",
      "name": "Bella",
      "breed": "Labrador",
      "avatar_url": "https://...",
      "temperament": ["friendly", "calm"],
      "size": "large",
      "is_vaccinated": true,
      "mutual_friends": 3,
      "compatibility_score": 78,
      "owner": {
        "display_name": "James Wilson",
        "city": "San Francisco"
      }
    }
  ]
}
```

---

### GET /discover/suggested `[Edge Function]`
Friends-of-friends suggestions. Pure Neo4j graph query.

**Edge Function: `discover-suggested`**

**Query Parameters**
| Param | Type | Default |
|---|---|---|
| pet_id | uuid | required |
| limit | int | 20 |

**Neo4j Query**
```cypher
MATCH (me:Pet {id: $pet_id})-[:FRIENDS_WITH]->(friend:Pet)-[:FRIENDS_WITH]->(suggestion:Pet)
WHERE suggestion.id <> $pet_id
  AND NOT (me)-[:FRIENDS_WITH]->(suggestion)
  AND NOT (me)-[:BLOCKED]-(suggestion)
  AND NOT (me)-[:SENT_REQUEST_TO]->(suggestion)
  AND suggestion.species = me.species
WITH suggestion,
     COUNT(DISTINCT friend) as mutual_count,
     COLLECT(DISTINCT friend.name)[0..2] as mutual_names,
     SIZE([t IN suggestion.temperament WHERE t IN me.temperament]) as shared_traits
ORDER BY mutual_count DESC, shared_traits DESC
RETURN suggestion.id as pet_id, mutual_count, mutual_names, shared_traits
LIMIT $limit
```

**Response 200**
```json
{
  "data": [
    {
      "pet_id": "uuid",
      "mutual_friends_count": 4,
      "mutual_friends_preview": ["Max", "Bella"],
      "compatibility_score": 85,
      "pet": {
        "name": "Cooper",
        "breed": "Beagle",
        "avatar_url": "https://...",
        "temperament": ["friendly", "playful"],
        "size": "small",
        "is_vaccinated": true,
        "owner": { "display_name": "Emily Chen", "city": "San Francisco" }
      }
    }
  ]
}
```

---

### GET /discover/compatible `[Edge Function]`
Compatibility-matched pets. Scores by temperament, size, species, vaccination.

**Edge Function: `discover-compatible`**

**Query Parameters**
| Param | Type | Default |
|---|---|---|
| pet_id | uuid | required |
| min_score | int | 50 |
| limit | int | 20 |

**Neo4j Query**
```cypher
MATCH (me:Pet {id: $pet_id})
MATCH (other:Pet)
WHERE other.species = me.species
  AND other.city = me.city
  AND other.id <> $pet_id
  AND NOT (me)-[:BLOCKED]-(other)
  AND NOT (me)-[:FRIENDS_WITH]-(other)
WITH me, other,
     SIZE([t IN other.temperament WHERE t IN me.temperament]) as shared_traits,
     SIZE(me.temperament) as my_trait_count
WITH me, other, shared_traits, my_trait_count,
     CASE WHEN my_trait_count > 0
          THEN toFloat(shared_traits) / my_trait_count * 60
          ELSE 0 END as trait_score,
     CASE WHEN me.size = other.size THEN 20 ELSE 0 END as size_score,
     CASE WHEN me.is_vaccinated AND other.is_vaccinated THEN 10 ELSE 0 END as vacc_score
WITH other,
     toInteger(trait_score + size_score + vacc_score + 10) as compat_score
WHERE compat_score >= $min_score
ORDER BY compat_score DESC
RETURN other.id as pet_id, compat_score
LIMIT $limit
```

**Response 200**
```json
{
  "data": [
    {
      "pet_id": "uuid",
      "compatibility_score": 90,
      "match_reasons": ["Same size", "Both vaccinated", "Shared temperament: friendly, calm"],
      "pet": {
        "name": "Luna",
        "breed": "Poodle",
        "avatar_url": "https://...",
        "temperament": ["calm", "friendly", "playful"],
        "size": "medium",
        "is_vaccinated": true,
        "owner": { "display_name": "Maria Garcia", "city": "San Francisco" }
      }
    }
  ]
}
```

---

### GET /pets/:id/mutual-friends/:other_id `[Edge Function]`
Get mutual friends between two pets.

**Edge Function: `mutual-friends`**

**Neo4j Query**
```cypher
MATCH (a:Pet {id: $pet_a})-[:FRIENDS_WITH]->(mutual:Pet)<-[:FRIENDS_WITH]-(b:Pet {id: $pet_b})
RETURN mutual.id as pet_id, mutual.name, mutual.breed
```

**Response 200**
```json
{
  "count": 3,
  "data": [
    { "pet_id": "uuid", "name": "Max", "breed": "Golden Retriever", "avatar_url": "https://..." }
  ]
}
```

---

### GET /pets/:id/relationship-status/:other_id `[SDK]`
Check the relationship status between two pets.

```swift
let rel = try await supabase
    .from("pet_relationships")
    .select("id, rel_type, from_pet_id, created_at")
    .or("and(from_pet_id.eq.\(petId),to_pet_id.eq.\(otherId)),and(from_pet_id.eq.\(otherId),to_pet_id.eq.\(petId))")
    .maybeSingle()
    .execute()
```

**Response 200**
```json
{
  "status": "FRIEND",
  "relationship_id": "uuid",
  "direction": "outgoing",
  "since": "2024-01-15T10:00:00Z",
  "compatibility": 82
}
```

Possible `status` values: `NONE`, `FRIEND_REQ_SENT`, `FRIEND_REQ_RECEIVED`, `FRIEND`, `BLOCKED`

---

## Realtime: Friend Request Notification

The iOS app subscribes to the `notifications` table via Supabase Realtime to get instant friend request alerts without polling.

```swift
let channel = supabase.realtimeV2.channel("notifications:\(userId)")

channel.onPostgresChanges(
    AnyAction.self,
    schema: "public",
    table: "notifications",
    filter: "recipient_id=eq.\(userId)"
) { change in
    if case .insert(let record) = change {
        if record.type == "FRIEND_REQUEST" {
            showFriendRequestBadge()
        }
    }
}

await channel.subscribe()
```

---

## Error Reference (this service)

| Code | HTTP | Meaning |
|---|---|---|
| `NOT_FOUND` | 404 | Pet does not exist or is inactive |
| `AUTH_FORBIDDEN` | 403 | Caller does not own the pet |
| `ALREADY_FRIENDS` | 409 | Pets are already friends |
| `REQUEST_PENDING` | 409 | A friend request already exists |
| `BLOCKED` | 403 | One pet has blocked the other |
| `INVALID_REQUEST` | 400 | e.g. requesting yourself, same owner |
| `GRAPH_ERROR` | 500 | Neo4j query failed — retryable |
