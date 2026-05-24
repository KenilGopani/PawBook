# PawBook — Architecture Overview

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        iOS App (SwiftUI)                         │
│                                                                  │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Auth    │  │  Feed    │  │  Meetup  │  │  Map / Discovery │  │
│  │  Views   │  │  Views   │  │  Views   │  │  Views           │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────────────┘  │
│       │              │              │              │              │
│  ┌────┴──────────────┴──────────────┴──────────────┴────┐        │
│  │              Supabase Swift SDK                       │        │
│  │  (Auth, Database, Storage, Realtime, Edge Functions)  │        │
│  └──────────────────────┬───────────────────────────────┘        │
└─────────────────────────┼────────────────────────────────────────┘
                          │ HTTPS
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase Platform                             │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Supabase    │  │  PostgreSQL  │  │  Supabase Storage      │ │
│  │  Auth        │  │  15 + PostGIS│  │  (avatars, media, docs)│ │
│  │  (JWT, Apple)│  │  + pg_trgm   │  │                        │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────────────────┘ │
│         │                 │                                      │
│         │    ┌────────────┴──────────────┐                      │
│         │    │  Row-Level Security (RLS) │                      │
│         │    │  auth.uid() enforcement   │                      │
│         │    └──────────────────────────┘                      │
│         │                                                       │
│  ┌──────┴───────────────────────────────────────────────────┐   │
│  │              Edge Functions (Deno/TypeScript)              │   │
│  │                                                            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────────┐   │   │
│  │  │create-pet│ │update-pet│ │search  │ │delete-account│   │   │
│  │  │          │ │          │ │-pets   │ │              │   │   │
│  │  └──────────┘ └──────────┘ └────────┘ └──────────────┘   │   │
│  │  ┌──────────┐ ┌──────────────┐ ┌──────────────────────┐  │   │
│  │  │upload-*  │ │update-location│ │delete-pet            │  │   │
│  │  └──────────┘ └──────┬───────┘ └──────────────────────┘  │   │
│  └───────────────────────┼───────────────────────────────────┘   │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │ HTTPS (Neo4j HTTP API)
                           ▼
              ┌────────────────────────┐
              │   Neo4j AuraDB         │
              │                        │
              │  Nodes:                │
              │    Pet, Owner, Place   │
              │                        │
              │  Relationships:        │
              │    FRIENDS_WITH        │
              │    OWNS                │
              │    VISITED             │
              │    BLOCKED             │
              │    SENT_REQUEST_TO     │
              │    MET_AT              │
              └────────────────────────┘
```

---

## Data Flow Patterns

### 1. Simple Read (SDK direct — no Edge Function)

```
iOS App → Supabase SDK → PostgreSQL (RLS-filtered) → Response
```

**Examples**: Get my profile, list my pets, view a post, read notifications.

The iOS app calls the Supabase SDK directly. The JWT in the Authorization header is validated automatically. RLS policies filter the query results to only rows the user is authorized to see.

### 2. Write with Neo4j Sync (Edge Function required)

```
iOS App → Edge Function → PostgreSQL INSERT/UPDATE
                        → Neo4j MERGE/SET (async)
                        → Response
```

**Examples**: Create pet, update location, accept friend request.

The Edge Function:
1. Validates input
2. Applies business logic (pet limit, ownership check)
3. Writes to PostgreSQL
4. Syncs to Neo4j via HTTP API
5. Returns response

### 3. Graph-Powered Read (Edge Function → Neo4j)

```
iOS App → Edge Function → Neo4j Cypher query → Response
```

**Examples**: Suggested friends, compatible pets, friends-of-friends, social proof on places.

These queries are inherently graph traversals and run faster in Neo4j than recursive CTEs in PostgreSQL.

### 4. File Upload (Edge Function → Storage)

```
iOS App → Edge Function → Validate file
                        → Upload to Storage bucket
                        → Update DB record with URL
                        → Response (with public/signed URL)
```

**Examples**: Profile avatar, pet avatar, vaccination document, post media.

---

## Authorization Layers

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Supabase Auth (JWT Validation)        │
│  • Every request must carry valid JWT            │
│  • Signature, expiry, audience auto-validated    │
├─────────────────────────────────────────────────┤
│  Layer 2: RLS Policies (PostgreSQL)             │
│  • Every table has RLS enabled                   │
│  • auth.uid() restricts row access               │
│  • Cannot be bypassed — primary auth layer       │
├─────────────────────────────────────────────────┤
│  Layer 3: Edge Function Guards (Business Logic) │
│  • Complex rules beyond RLS capability           │
│  • Pet ownership verification                    │
│  • Meetup eligibility (friend check via Neo4j)   │
│  • Rate limits, file validation                  │
└─────────────────────────────────────────────────┘
```

---

## Database Schema Overview

### Supabase (PostgreSQL) — 14 Tables

| Table | Purpose | Key Features |
|---|---|---|
| `profiles` | User profiles | PostGIS location, auto-created on signup |
| `pets` | Pet profiles | Temperament array, pg_trgm fuzzy search |
| `vaccination_records` | Vet documents | Tiered read access (owner vs public) |
| `pet_relationships` | Social graph edges | Neo4j sync trigger, state machine |
| `follows` | Owner-to-owner follows | Feed relevance |
| `places` | Locations | PostGIS, type categorization |
| `place_reviews` | Community ratings | avg_rating trigger on places |
| `meetups` | Scheduled meetups | Status state machine |
| `meetup_participants` | RSVP tracking | Pet-level participation |
| `posts` | Feed content | Denormalized like_count, comment_count |
| `post_reactions` | PAW/BONE/HEART | One-per-pet unique, trigger-maintained |
| `comments` | Threaded replies | parent_id self-reference |
| `notifications` | In-app alerts | JSONB payload, Realtime-ready |
| `lost_pet_alerts` | Lost & found | PostGIS last-seen location |
| `community_alerts` | Safety alerts | Expiry-based auto-hide |
| `reports` | Moderation | Polymorphic target |

### Neo4j — 3 Node Types, 6 Relationship Types

| Element | Purpose |
|---|---|
| `(:Pet)` | Mirrors Supabase pets — social graph anchor |
| `(:Owner)` | Mirrors profiles — relationship anchor |
| `(:Place)` | Mirrors places — visit tracking |
| `[:FRIENDS_WITH]` | Bidirectional friendship |
| `[:BLOCKED]` | One-directional block |
| `[:SENT_REQUEST_TO]` | Pending friend request |
| `[:OWNS]` | Owner → Pet link |
| `[:VISITED]` | Pet → Place check-in |
| `[:MET_AT]` | Meetup location record |

---

## Storage Buckets

| Bucket | Public | Max Size | Path Convention |
|---|---|---|---|
| `avatars` | ✅ | 5MB | `{user_id}/profile.jpg` |
| `pet-avatars` | ✅ | 5MB | `{pet_id}/avatar.jpg` |
| `vax-docs` | ❌ | 10MB | `{pet_id}/{record_id}.pdf` |
| `post-media` | ✅ | 10MB | `{pet_id}/{post_id}/{filename}` |

---

## Sync Strategy (Supabase ↔ Neo4j)

All sync is **eventually consistent** (<1s typical lag). Sync is triggered by Edge Functions after successful PostgreSQL writes.

| Supabase Event | Neo4j Action |
|---|---|
| profiles INSERT | MERGE Owner node |
| pets INSERT | MERGE Pet node + OWNS relationship |
| pets UPDATE | SET properties on Pet node |
| pets soft-delete | SET is_active = false |
| relationship → FRIEND | MERGE bidirectional FRIENDS_WITH |
| relationship → BLOCKED | Delete FRIENDS_WITH + MERGE BLOCKED |
| meetup COMPLETED | MERGE VISITED for each participant |
| places INSERT | MERGE Place node |

**Blocking is enforced immediately in Supabase** (not dependent on Neo4j sync).
