# PawBook — Database Schema: Neo4j (Social Graph)

## Connection
- **Driver**: Neo4j HTTP API (Bolt not available on AuraDB Free — use HTTPS endpoint)
- **Auth**: Basic auth (username + password from AuraDB console)
- **Access from**: Supabase Edge Functions only — iOS app never connects directly

```
AURA_URI=https://<instance-id>.databases.neo4j.io
AURA_USER=neo4j
AURA_PASSWORD=<from-aura-console>
```

---

## Node Labels

### `Pet`
Mirrors the `pets` table in Supabase. Synced on create/update.

```cypher
// Properties
{
  id: String (UUID — matches Supabase pets.id),
  name: String,
  species: String,
  breed: String,
  temperament: [String],   // array: ['friendly','calm']
  size: String,
  is_vaccinated: Boolean,
  owner_id: String,        // matches Supabase profiles.id
  city: String,
  lat: Float,              // owner's approximate location
  lng: Float,
  created_at: String       // ISO timestamp
}

// Constraints
CREATE CONSTRAINT pet_id_unique IF NOT EXISTS
FOR (p:Pet) REQUIRE p.id IS UNIQUE;

// Index for geo-ish filtering (city-level)
CREATE INDEX pet_city_idx IF NOT EXISTS FOR (p:Pet) ON (p.city);
CREATE INDEX pet_species_idx IF NOT EXISTS FOR (p:Pet) ON (p.species);
CREATE INDEX pet_breed_idx IF NOT EXISTS FOR (p:Pet) ON (p.breed);
```

### `Owner`
Mirrors `profiles` table. Lightweight node — used as relationship anchor.

```cypher
{
  id: String (UUID — matches Supabase profiles.id),
  display_name: String,
  city: String,
  lat: Float,
  lng: Float
}

CREATE CONSTRAINT owner_id_unique IF NOT EXISTS
FOR (o:Owner) REQUIRE o.id IS UNIQUE;
```

### `Place`
Mirrors `places` table. Used to track which pets visit which locations.

```cypher
{
  id: String,
  name: String,
  type: String,
  lat: Float,
  lng: Float,
  city: String,
  avg_rating: Float
}

CREATE CONSTRAINT place_id_unique IF NOT EXISTS
FOR (pl:Place) REQUIRE pl.id IS UNIQUE;
```

---

## Relationship Types

### `(:Pet)-[:FRIENDS_WITH]->(:Pet)`
Bidirectional friendship. Stored as two directed edges (A→B and B→A) for easy traversal.

```cypher
{
  since: String,           // ISO timestamp
  compatibility: Integer,  // 0–100 score
  met_at_place_id: String  // optional — where they first met
}
```

### `(:Pet)-[:BLOCKED]->(:Pet)`
Enforced in Supabase first, mirrored here to exclude blocked pets from graph queries.

```cypher
{ created_at: String }
```

### `(:Pet)-[:SENT_REQUEST_TO]->(:Pet)`
Pending friend request. Replaced by FRIENDS_WITH on acceptance.

```cypher
{ created_at: String }
```

### `(:Owner)-[:OWNS]->(:Pet)`
Connects owner node to their pets.

```cypher
{ since: String }
```

### `(:Pet)-[:VISITED]->(:Place)`
Check-in or meetup at a location.

```cypher
{
  visited_at: String,
  meetup_id: String   // optional
}
```

### `(:Pet)-[:MET_AT]->(:Place)`
Used for meetup recap — two pets met at a place.

```cypher
{
  meetup_id: String,
  met_at: String
}
```

---

## Core Cypher Queries

### Create a Pet node (called by Edge Function on insert)
```cypher
MERGE (p:Pet {id: $pet_id})
SET p.name = $name,
    p.species = $species,
    p.breed = $breed,
    p.temperament = $temperament,
    p.size = $size,
    p.is_vaccinated = $is_vaccinated,
    p.owner_id = $owner_id,
    p.city = $city,
    p.lat = $lat,
    p.lng = $lng,
    p.created_at = $created_at
```

### Create an Owner node and link to Pet
```cypher
MERGE (o:Owner {id: $owner_id})
SET o.display_name = $display_name,
    o.city = $city,
    o.lat = $lat,
    o.lng = $lng
WITH o
MATCH (p:Pet {id: $pet_id})
MERGE (o)-[:OWNS {since: $since}]->(p)
```

### Create a friendship (both directions)
```cypher
MATCH (a:Pet {id: $pet_a_id}), (b:Pet {id: $pet_b_id})
MERGE (a)-[r1:FRIENDS_WITH]->(b)
SET r1.since = $since, r1.compatibility = $compatibility
MERGE (b)-[r2:FRIENDS_WITH]->(a)
SET r2.since = $since, r2.compatibility = $compatibility
```

### Remove friendship
```cypher
MATCH (a:Pet {id: $pet_a_id})-[r:FRIENDS_WITH]-(b:Pet {id: $pet_b_id})
DELETE r
```

### Block a pet
```cypher
MATCH (a:Pet {id: $from_pet_id}), (b:Pet {id: $to_pet_id})
MERGE (a)-[:BLOCKED {created_at: $created_at}]->(b)
// Also remove any existing friendship
MATCH (a)-[f:FRIENDS_WITH]-(b) DELETE f
```

---

## Social Graph Queries (called from Edge Functions)

### 1. Friends of a pet (1 hop)
```cypher
MATCH (me:Pet {id: $my_pet_id})-[:FRIENDS_WITH]->(friend:Pet)
WHERE NOT (me)-[:BLOCKED]-(friend)
RETURN friend.id as pet_id, friend.name, friend.breed,
       friend.temperament, friend.city
```

### 2. Friends of friends (2 hops) — the key graph query
```cypher
MATCH (me:Pet {id: $my_pet_id})-[:FRIENDS_WITH*2]->(fof:Pet)
WHERE NOT (me)-[:FRIENDS_WITH]->(fof)
  AND NOT (me)-[:BLOCKED]-(fof)
  AND fof.id <> $my_pet_id
WITH fof,
     COUNT { (me)-[:FRIENDS_WITH*2]->(fof) } as mutual_count
ORDER BY mutual_count DESC
RETURN fof.id as pet_id, fof.name, fof.breed,
       fof.temperament, fof.city, mutual_count
LIMIT 50
```

### 3. Nearby pets by city (geo filtering at city level)
```cypher
MATCH (me:Pet {id: $my_pet_id})
MATCH (other:Pet)
WHERE other.city = me.city
  AND other.id <> $my_pet_id
  AND NOT (me)-[:BLOCKED]-(other)
  AND NOT (me)-[:FRIENDS_WITH]->(other)
RETURN other.id as pet_id, other.name, other.breed,
       other.temperament, other.species
LIMIT 100
```

### 4. Compatible pets (same species, compatible temperament, nearby)
```cypher
MATCH (me:Pet {id: $my_pet_id})
MATCH (other:Pet)
WHERE other.species = me.species
  AND other.city = me.city
  AND other.id <> $my_pet_id
  AND NOT (me)-[:BLOCKED]-(other)
  AND ANY(t IN other.temperament WHERE t IN me.temperament)
WITH me, other,
     SIZE([t IN other.temperament WHERE t IN me.temperament]) as shared_traits
ORDER BY shared_traits DESC
RETURN other.id as pet_id, other.name, other.breed,
       other.temperament, shared_traits as compatibility_score
LIMIT 30
```

### 5. Mutual friends between two pets
```cypher
MATCH (a:Pet {id: $pet_a_id})-[:FRIENDS_WITH]->(mutual:Pet)<-[:FRIENDS_WITH]-(b:Pet {id: $pet_b_id})
RETURN mutual.id as pet_id, mutual.name, mutual.breed
```

### 6. Suggested friends (friends of friends, sorted by mutual count + compatibility)
```cypher
MATCH (me:Pet {id: $my_pet_id})-[:FRIENDS_WITH]->(friend:Pet)-[:FRIENDS_WITH]->(suggestion:Pet)
WHERE suggestion.id <> $my_pet_id
  AND NOT (me)-[:FRIENDS_WITH]->(suggestion)
  AND NOT (me)-[:BLOCKED]-(suggestion)
  AND suggestion.species = me.species
WITH suggestion,
     COUNT(friend) as mutual_count,
     SIZE([t IN suggestion.temperament WHERE t IN $my_temperament]) as shared_traits
ORDER BY mutual_count DESC, shared_traits DESC
RETURN suggestion.id as pet_id, suggestion.name, suggestion.breed,
       suggestion.temperament, mutual_count, shared_traits
LIMIT 20
```

### 7. Places a pet and its friends have visited (social proof)
```cypher
MATCH (me:Pet {id: $my_pet_id})-[:FRIENDS_WITH]->(friend:Pet)-[:VISITED]->(place:Place)
WITH place, COUNT(friend) as friend_visits
ORDER BY friend_visits DESC
RETURN place.id as place_id, place.name, place.type,
       place.lat, place.lng, friend_visits
LIMIT 20
```

### 8. Check if two pets are connected (for meetup eligibility)
```cypher
MATCH (a:Pet {id: $pet_a_id}), (b:Pet {id: $pet_b_id})
RETURN EXISTS((a)-[:FRIENDS_WITH]-(b)) as are_friends,
       EXISTS((a)-[:BLOCKED]-(b)) as is_blocked
```

### 9. Record a meetup (add VISITED and MET_AT relationships)
```cypher
MATCH (a:Pet {id: $pet_a_id}), (b:Pet {id: $pet_b_id}), (pl:Place {id: $place_id})
MERGE (a)-[:VISITED {visited_at: $visited_at, meetup_id: $meetup_id}]->(pl)
MERGE (b)-[:VISITED {visited_at: $visited_at, meetup_id: $meetup_id}]->(pl)
MERGE (a)-[:MET_AT {meetup_id: $meetup_id, met_at: $visited_at}]->(pl)
MERGE (b)-[:MET_AT {meetup_id: $meetup_id, met_at: $visited_at}]->(pl)
```

---

## Compatibility Score Algorithm

Computed at query time in Cypher. Score 0–100.

```
score = (shared_temperament_traits / total_possible) * 60
      + (same_size ? 20 : 0)
      + (same_species ? 10 : 0)
      + (both_vaccinated ? 10 : 0)
```

```cypher
MATCH (me:Pet {id: $my_pet_id}), (other:Pet {id: $other_pet_id})
WITH me, other,
     SIZE([t IN other.temperament WHERE t IN me.temperament]) as shared_traits,
     SIZE(me.temperament) as my_traits
WITH me, other, shared_traits, my_traits,
     CASE WHEN my_traits > 0 THEN toFloat(shared_traits) / my_traits * 60 ELSE 0 END as trait_score,
     CASE WHEN me.size = other.size THEN 20 ELSE 0 END as size_score,
     CASE WHEN me.species = other.species THEN 10 ELSE 0 END as species_score,
     CASE WHEN me.is_vaccinated AND other.is_vaccinated THEN 10 ELSE 0 END as vacc_score
RETURN other.id as pet_id,
       toInteger(trait_score + size_score + species_score + vacc_score) as compatibility_score
```

---

## Sync Strategy (Neo4j ↔ Supabase)

| Event in Supabase | Action in Neo4j |
|---|---|
| `profiles` INSERT | `MERGE (o:Owner {id})` |
| `pets` INSERT | `MERGE (p:Pet {id})`, `MERGE (o)-[:OWNS]->(p)` |
| `pets` UPDATE | `SET p.* = ...` on existing node |
| `pets` soft-delete (`is_active=false`) | `SET p.is_active = false` (keep node for graph integrity) |
| `pet_relationships` INSERT (FRIEND) | `MERGE (a)-[:FRIENDS_WITH]->(b)` both directions |
| `pet_relationships` UPDATE (BLOCKED) | Delete FRIENDS_WITH, `MERGE (a)-[:BLOCKED]->(b)` |
| `meetup_participants` status=COMPLETED | `MERGE (p)-[:VISITED]->(pl)` for each participant |
| `places` INSERT | `MERGE (pl:Place {id})` |

All sync is handled by Supabase Edge Functions. See `10_sync_supabase_neo4j.md`.
