# 🐾 PawBook

A mobile-first social platform where pets are the primary social identity. Owners connect through their pets, discover compatible playmates nearby, and schedule real-world meetups.

## Architecture

```
iOS App (SwiftUI)
  └── Supabase Swift SDK
        ├── Auth (JWT, Apple Sign-In)
        ├── Database (PostgreSQL 15 + PostGIS)
        ├── Storage (media uploads)
        ├── Realtime (live notifications)
        └── Edge Functions (Deno)
              └── Neo4j AuraDB (social graph)
```

### Key Design Decisions

- **Pet-first identity** — the pet profile is the primary social entity, not the owner
- **RLS at the DB layer** — every table has Row-Level Security; authorization is never API-only
- **Soft deletes** — no hard deletes on pets, profiles, posts, or meetups
- **Denormalized counts** — `like_count`, `comment_count` maintained by DB triggers
- **Eventually consistent graph** — Neo4j syncs from Supabase via Edge Functions (<1s lag)
- **iOS never talks to Neo4j** — all graph queries proxied through Edge Functions

## Project Structure

```
PawBook/
├── buildMDs/                    # Engineering spec documents
├── docs/                        # Architecture & developer guides
├── neo4j/                       # Graph DB setup scripts
│   ├── setup_constraints.cypher # Node constraints & indexes
│   └── queries.cypher           # Production Cypher query templates
└── supabase/
    ├── config.toml              # Supabase CLI configuration
    ├── migrations/              # Sequential SQL migration files
    │   ├── 00001_extensions.sql
    │   ├── 00002_profiles.sql
    │   ├── ...
    │   └── 00015_storage_buckets.sql
    └── functions/               # Supabase Edge Functions (Deno/TypeScript)
        ├── _shared/             # Shared utilities (auth, Neo4j client, CORS)
        ├── create-pet/
        ├── update-pet/
        ├── delete-pet/
        ├── upload-avatar/
        ├── upload-pet-avatar/
        ├── upload-vax-doc/
        ├── update-location/
        ├── delete-account/
        └── search-pets/
```

## Setup

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- [Deno](https://deno.land/) 1.30+ (for Edge Function development)
- Neo4j AuraDB account (free tier works for development)

### 1. Clone & Configure

```bash
git clone <repo-url>
cd PawBook
cp .env.example .env
# Fill in your Supabase and Neo4j credentials in .env
```

### 2. Run Migrations

**Option A — Supabase CLI (recommended)**
```bash
supabase db push
```

**Option B — Dashboard**
Run each file in `supabase/migrations/` sequentially in the Supabase SQL Editor.

### 3. Setup Neo4j

Run the contents of `neo4j/setup_constraints.cypher` in your AuraDB Browser console.

### 4. Deploy Edge Functions

```bash
supabase functions deploy create-pet
supabase functions deploy update-pet
supabase functions deploy delete-pet
supabase functions deploy upload-avatar
supabase functions deploy upload-pet-avatar
supabase functions deploy upload-vax-doc
supabase functions deploy update-location
supabase functions deploy delete-account
supabase functions deploy search-pets
```

Or deploy all at once:
```bash
supabase functions deploy
```

### 5. Set Edge Function Secrets

```bash
supabase secrets set NEO4J_URI=https://your-instance.databases.neo4j.io
supabase secrets set NEO4J_USER=neo4j
supabase secrets set NEO4J_PASSWORD=your-password
```

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Mobile | Swift 5.9+ / SwiftUI | Native iOS app |
| Auth | Supabase Auth | JWT, Apple Sign-In |
| Database | PostgreSQL 15 + PostGIS | Transactional data, geo queries |
| Graph DB | Neo4j AuraDB | Social graph traversal |
| Storage | Supabase Storage | Media uploads (avatars, docs) |
| Realtime | Supabase Realtime | Live notifications |
| Edge Functions | Deno (TypeScript) | Business logic, Neo4j sync |

## Domain Model

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

## License

See [LICENSE](LICENSE) for details.