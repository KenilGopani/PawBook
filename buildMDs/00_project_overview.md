# PawBook — Project Overview

## Vision
PawBook is a mobile-first social platform for pet owners. Pets have their own profiles. Owners connect through their pets, discover compatible playmates nearby, and schedule real-world meetups. The platform also serves as a community safety layer (lost pet alerts, park incident reports).

## Core Principles
- **Pet-first**: the pet profile is the primary social identity, not the owner
- **Real-world connection**: the meetup engine is the killer feature — everything else supports it
- **Safety by default**: vaccination records, temperament tags, and RLS-enforced privacy from day one
- **Ship fast, scale smart**: Supabase for everything transactional; Neo4j for the social graph

---

## Tech Stack

### Mobile
| Layer | Choice | Reason |
|---|---|---|
| Language | Swift 5.9+ | Native iOS performance |
| UI | SwiftUI | Modern, declarative |
| Networking | Supabase Swift SDK + URLSession | Official SDK covers auth, DB, storage, realtime |
| Maps | MapKit | Native, no extra cost |
| Push | APNs via Supabase | Integrated notification delivery |

### Backend
| Layer | Choice | Reason |
|---|---|---|
| Auth | Supabase Auth | Built-in JWT, Apple Sign-In, RLS integration |
| Database | Supabase (PostgreSQL 15 + PostGIS) | Transactional data, geo queries |
| Graph DB | Neo4j AuraDB Free | Social graph, friend traversal, compatibility matching |
| Storage | Supabase Storage | Media uploads via pre-signed URLs |
| Realtime | Supabase Realtime | Live notifications, feed updates |
| Edge Functions | Supabase Edge Functions (Deno) | Sync bridge to Neo4j, background logic |
| File hosting | Supabase Storage CDN | Media delivery |

### Sync Architecture
```
iOS App
  └── Supabase SDK (auth, CRUD, realtime, storage)
        └── Supabase Edge Functions (triggers on DB events)
              └── Neo4j AuraDB (graph writes/reads via HTTP API)
```

---

## SDLC Phases for This Project

```
Phase 1  Database schema design (Supabase + Neo4j)
Phase 2  Auth & authorization design
Phase 3  Service & API endpoint design
Phase 4  iOS app architecture
Phase 5  Implementation (AI-agent executable)
Phase 6  Testing strategy
Phase 7  Deployment & CI/CD
```

This spec set covers Phases 1–3 in full detail, sufficient for an AI agent to implement the backend without ambiguity.

---

## Domain Entities (High Level)

```
Owner (auth user)
  └── has many Pets
        └── has many Posts
        └── has many Relationships (with other Pets)
        └── participates in many Meetups

Place (dog park, cafe, trail)
  └── has many Meetups
  └── has many Reviews
  └── has many Check-ins

Alert (lost pet, community incident)
  └── belongs to Owner
  └── has geo location + radius
```

---

## Key Design Decisions

### 1. Supabase handles everything except graph traversal
All CRUD, auth, media, notifications, and meetup scheduling live in Supabase. Neo4j is only queried when the operation is inherently a graph traversal (friend-of-friend discovery, compatibility matching, social recommendations).

### 2. iOS app never talks to Neo4j directly
All Neo4j reads/writes are proxied through Supabase Edge Functions. This keeps the client simple and allows the graph DB to be swapped in future without touching the iOS app.

### 3. Row-Level Security (RLS) enforced at DB layer
Every Supabase table has RLS enabled. Policies enforce that users can only read/write data they are authorized to access. Authorization is never handled only at the API layer.

### 4. Soft deletes everywhere
No hard deletes on pets, profiles, posts, or meetups. All use `is_active boolean` or `deleted_at timestamptz`. This supports audit trails and "undo" functionality.

### 5. Denormalized counts for performance
`posts.like_count` and `posts.comment_count` are maintained by DB triggers. This avoids COUNT(*) queries on every feed load.

### 6. Graph sync is eventually consistent
When a friendship is created in Supabase, an Edge Function syncs it to Neo4j asynchronously. There is a small window (< 1s typical) where the graph may lag. This is acceptable for social features but not for blocking (block is enforced in Supabase immediately).

---

## Environments

| Environment | Supabase Project | Neo4j Instance | Notes |
|---|---|---|---|
| Development | `pawbook-dev` | AuraDB Free (dev) | Local iOS simulator |
| Staging | `pawbook-staging` | AuraDB Free (staging) | TestFlight builds |
| Production | `pawbook-prod` | AuraDB Professional | App Store |

---

## File Index

| File | Contents |
|---|---|
| `00_project_overview.md` | This file |
| `01_database_schema_supabase.md` | All Supabase tables, columns, indexes, RLS policies |
| `02_database_schema_neo4j.md` | Graph nodes, relationships, Cypher queries |
| `03_authentication.md` | Auth flows, JWT, Apple Sign-In, RLS policies |
| `04_service_user_pet.md` | User & pet service — all endpoints |
| `05_service_social_graph.md` | Social graph service — all endpoints |
| `06_service_feed.md` | Feed, posts, reactions, comments |
| `07_service_meetup.md` | Meetup lifecycle — all endpoints |
| `08_service_location.md` | Places, geo search, check-ins |
| `09_service_alerts.md` | Lost pets, community alerts, moderation |
| `10_sync_supabase_neo4j.md` | Edge Function sync logic |
| `11_api_conventions.md` | Error codes, pagination, versioning, headers |
