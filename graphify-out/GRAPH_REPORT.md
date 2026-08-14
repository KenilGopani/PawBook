# Graph Report - PawBook  (2026-08-12)

## Corpus Check
- 102 files · ~54,691 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1023 nodes · 1627 edges · 108 communities (96 shown, 12 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `01b8a768`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]
- [[_COMMUNITY_Community 105|Community 105]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 107|Community 107]]

## God Nodes (most connected - your core abstractions)
1. `errorResponse()` - 48 edges
2. `handleCors()` - 48 edges
3. `createUserClient()` - 47 edges
4. `getAuthUser()` - 47 edges
5. `AppError` - 44 edges
6. `ok()` - 39 edges
7. `neo4jQuery()` - 31 edges
8. `getQueryParams()` - 23 edges
9. `NotFoundError` - 21 edges
10. `assertPetOwner()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `sendPushToOwners()` --calls--> `createAdminClient()`  [EXTRACTED]
  supabase/functions/_shared/push.ts → supabase/functions/_shared/supabase.ts
- `computeCompatibility()` --calls--> `neo4jQuery()`  [EXTRACTED]
  supabase/functions/_shared/helpers.ts → supabase/functions/_shared/neo4j.ts

## Communities (108 total, 12 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.22
Nodes (9): code:json ({), code:json ({ "invited_count": 2 }), code:sql (-- Run every 15 minutes, complete meetups that ended > 2 hou), code:swift (var query = supabase), code:json ({), GET /meetups `[SDK]`, Meetup Endpoints, pg_cron Job: Auto-complete meetups (+1 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (15): Base URLs, code:block1 (Edge Functions (production):  https://<project-ref>.supabase), code:swift (// iOS: parse UTC, display local), code:swift (let idempotencyKey = UUID().uuidString), code:block19 (/functions/v1/<function-name>), code:block21 (supabase/), Date & Time, Edge Function File Structure (+7 more)

### Community 2 - "Community 2"
Cohesion: 0.22
Nodes (9): code:swift (try await supabase), code:cypher (MATCH (me:Pet)-[:FRIENDS_WITH]->(friend:Pet)-[:VISITED]->(pl), code:json ({), code:swift (let place = try await supabase), code:json ({), GET /places/:id `[SDK]`, GET /places/:id/social-proof `[Edge Function]`, PATCH /places/:id `[SDK]` (+1 more)

### Community 3 - "Community 3"
Cohesion: 0.25
Nodes (7): code:block1 (Default (all users):), code:typescript (function distanceLabel(metres: number): string {), Distance Label Helper, Error Reference (this service), Overview, PawBook — Service: Location, Places & Check-ins, Privacy Model

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (24): code:typescript (const NEO4J_URI = Deno.env.get("NEO4J_URI")!;       // https), code:sql (-- pg_cron: check Neo4j connectivity every 5 minutes), code:typescript (Deno.serve(async () => {), code:typescript (// /supabase/functions/sync-owner-create/index.ts), code:block3 (Table:   profiles), code:typescript (// /supabase/functions/sync-pet-update/index.ts), code:typescript (// /supabase/functions/sync-relationship-delete/index.ts), code:typescript (Deno.serve(async (req) => {) (+16 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (36): code:block1 (Home feed for owner X =), code:json ({), code:typescript (// 1. Verify caller owns pet_id), code:json ({), code:swift (try await supabase), code:json ({ "success": true }), code:swift (let reactions = try await supabase), code:json ({) (+28 more)

### Community 6 - "Community 6"
Cohesion: 0.18
Nodes (10): ALLOWED_MEDIA_CONTENT_TYPES, ALLOWED_PLACE_TAGS, ALLOWED_PLACE_TYPES, ALLOWED_POST_MEDIA_TYPES, ALLOWED_RSVP_STATUSES, CreatePetInput, DOC_TYPES, IMAGE_TYPES (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (23): code:json ({), code:typescript (// 1. Verify caller owns pet_id), code:json ({), code:swift (try await supabase), code:json ({), code:swift (try await supabase), code:json ({ "success": true }), code:typescript (Deno.serve(async (req) => {) (+15 more)

### Community 8 - "Community 8"
Cohesion: 0.22
Nodes (9): code:json ({), code:typescript (// 1. Verify caller owns from_pet_id), code:json ({ "success": true }), code:json ({), code:typescript (Deno.serve(async (req) => {), code:json ({), DELETE /relationships/block `[Edge Function]`, Friend Request Endpoints (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.18
Nodes (11): code:json ({), code:typescript (// 1. Verify caller owns reviewer_pet_id), code:json ({), code:swift (let reviews = try await supabase), code:json ({), code:swift (let reviews = try await supabase), code:json ({), GET /meetups/:id/reviews `[SDK]` (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.20
Nodes (10): code:swift (let alerts = try await supabase), code:json ({), code:typescript (// 1. Verify alert is ACTIVE), code:json ({ "success": true, "message": "Sighting reported to the pet ), code:swift (try await supabase), code:json ({ "success": true, "status": "RESOLVED" }), GET /alerts/lost-pet/mine `[SDK]`, Lost Pet Alerts (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.20
Nodes (8): code:typescript (const { data } = await supabase.rpc("community_alerts_nearby), code:json ({), code:swift (try await supabase), code:json ({ "success": true }), Community Alerts, GET /alerts/community/nearby `[Edge Function]`, PATCH /alerts/community/:id/deactivate `[SDK]`, pg_cron Job: Auto-expire community alerts

### Community 12 - "Community 12"
Cohesion: 0.20
Nodes (10): code:typescript (// 1. Get caller's pet and location from Supabase), code:json ({), code:cypher (MATCH (me:Pet {id: $pet_id})-[:FRIENDS_WITH]->(friend:Pet)-[), code:json ({), code:cypher (MATCH (a:Pet {id: $pet_a})-[:FRIENDS_WITH]->(mutual:Pet)<-[:), code:json ({), Discovery Endpoints (Neo4j-powered), GET /discover/nearby `[Edge Function]` (+2 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (13): cityPetIds, excludePetIds, explorePetIds, friendPetIds, myPetIds, paginated, params, petsQuery (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.18
Nodes (10): enrichedPosts, feedPetIds, followedPetIds, followingOwnerIds, friendPetIds, myPetIds, params, postIds (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (17): now, supabase, params, pathParts, petIds, result, supabase, url (+9 more)

### Community 16 - "Community 16"
Cohesion: 0.20
Nodes (9): params, pathParts, petIds, petsMap, result, since_date, sinceDate, supabase (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (8): code:json ({), code:swift (struct PaginatedResponse<T: Codable>: Codable {), code:block9 (GET /feed?limit=20&cursor=2024-01-15T10:00:00Z), iOS Implementation, Pagination, Request, Response, Rules

### Community 18 - "Community 18"
Cohesion: 0.17
Nodes (11): Auth Header (required on all endpoints), Base URL, code:block1 (Production:  https://<project-ref>.supabase.co/functions/v1), code:block2 (Authorization: Bearer <supabase_access_token>), code:block42 (GET /search/pets?q=golden&species=dog&city=San+Francisco&lim), code:typescript (// Uses PostgreSQL pg_trgm index for fuzzy name/breed search), code:json ({), Error Reference (this service) (+3 more)

### Community 19 - "Community 19"
Cohesion: 0.29
Nodes (6): allowedStates, params, pathParts, scheduledTime, supabase, url

### Community 20 - "Community 20"
Cohesion: 0.22
Nodes (9): code:json ({), code:swift (try await supabase), code:json ({), code:block39 (file: <PDF or image, max 10MB>), code:typescript (// 1. Verify caller owns the pet), code:json ({), POST /pets/:id/vaccinations/:record_id/document `[Edge Function]`, POST /pets/:id/vaccinations `[SDK]` (+1 more)

### Community 21 - "Community 21"
Cohesion: 0.22
Nodes (8): ALLOWED_GENDERS, ALLOWED_SIZES, ALLOWED_SPECIES, ALLOWED_TEMPERAMENTS, neo4jFields, setClauses, supabase, updateFields

### Community 22 - "Community 22"
Cohesion: 0.25
Nodes (6): ValidationError, future, result, validateCreatePet(), validateLocation(), validateUpdateProfile()

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (5): params, petIds, petsMap, result, supabase

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (5): params, petIds, petsMap, result, supabase

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (5): adminClient, { data: urlData }, file, petId, supabase

### Community 26 - "Community 26"
Cohesion: 0.29
Nodes (5): params, pathParts, supabase, url, ALLOWED_REACTION_TYPES

### Community 27 - "Community 27"
Cohesion: 0.22
Nodes (8): fmt, lineWidth, lint, rules, exclude, tasks, check, test

### Community 28 - "Community 28"
Cohesion: 0.33
Nodes (5): ALLOWED_REPORT_REASONS, ALLOWED_REPORT_TARGETS, oneHourAgo, supabase, twentyFourHoursAgo

### Community 29 - "Community 29"
Cohesion: 0.09
Nodes (26): lat, lng, params, result, supabase, blockedPetIds, grouped, lat (+18 more)

### Community 30 - "Community 30"
Cohesion: 0.25
Nodes (7): friendsPreview, params, pathParts, petsMap, previewPetIds, supabase, url

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (14): code:typescript (// 1. Set profiles.is_active = false), code:json ({ "confirm": "DELETE MY ACCOUNT" }), code:json ({ "success": true, "message": "Account deactivated. Data ret), code:swift (// iOS — direct SDK call, no Edge Function), code:json ({), code:swift (let profile = try await supabase), code:json ({ "error": "NOT_FOUND", "message": "Profile not found" }), code:json ({) (+6 more)

### Community 32 - "Community 32"
Cohesion: 0.05
Nodes (36): Auth Methods Supported, Authorization Model, Authorization Rules Summary, Auto-Refresh (iOS), code:block1 (iOS App), code:block10 (New user signs in), code:swift (func checkOnboardingState() async -> OnboardingStep {), code:swift (// On app launch — restore existing session) (+28 more)

### Community 33 - "Community 33"
Cohesion: 0.06
Nodes (35): Adding a New Edge Function, Admin Client (use for system operations), Checklist for New Functions, code:block1 (supabase/functions/), code:bash (supabase functions deploy my-new-function), code:bash (supabase secrets set MY_NEW_VAR=value), code:bash (# Start the Supabase local stack (PostgreSQL, Auth, Storage,), code:bash (supabase db push) (+27 more)

### Community 34 - "Community 34"
Cohesion: 0.10
Nodes (31): supabase, petInput, supabase, duplicate, supabase, supabase, adminClient, now (+23 more)

### Community 35 - "Community 35"
Cohesion: 0.15
Nodes (13): code:swift (let pets = try await supabase), code:json ({), code:swift (let pet = try await supabase), code:json ({), code:block32 (file: <image data>  (JPEG or PNG, max 5MB)), code:json ({), code:typescript (// 1. Verify caller owns the pet), code:json ({ "success": true }) (+5 more)

### Community 36 - "Community 36"
Cohesion: 0.09
Nodes (21): 1. Supabase handles everything except graph traversal, 2. iOS app never talks to Neo4j directly, 3. Row-Level Security (RLS) enforced at DB layer, 4. Soft deletes everywhere, 5. Denormalized counts for performance, 6. Graph sync is eventually consistent, Backend, code:block1 (iOS App) (+13 more)

### Community 37 - "Community 37"
Cohesion: 0.10
Nodes (19): 1. Simple Read (SDK direct — no Edge Function), 2. Write with Neo4j Sync (Edge Function required), 3. Graph-Powered Read (Edge Function → Neo4j), 4. File Upload (Edge Function → Storage), Authorization Layers, code:block1 (┌───────────────────────────────────────────────────────────), code:block2 (iOS App → Supabase SDK → PostgreSQL (RLS-filtered) → Respons), code:block3 (iOS App → Edge Function → PostgreSQL INSERT/UPDATE) (+11 more)

### Community 38 - "Community 38"
Cohesion: 0.11
Nodes (19): 1. Friends of a pet (1 hop), 2. Friends of friends (2 hops) — the key graph query, 3. Nearby pets by city (geo filtering at city level), 4. Compatible pets (same species, compatible temperament, nearby), 5. Mutual friends between two pets, 6. Suggested friends (friends of friends, sorted by mutual count + compatibility), 7. Places a pet and its friends have visited (social proof), 8. Check if two pets are connected (for meetup eligibility) (+11 more)

### Community 39 - "Community 39"
Cohesion: 0.29
Nodes (6): validateDocFile(), adminClient, file, petId, recordId, supabase

### Community 40 - "Community 40"
Cohesion: 0.15
Nodes (13): code:cypher ({), code:cypher ({), code:cypher ({ created_at: String }), code:cypher ({ created_at: String }), code:cypher ({ since: String }), code:cypher ({), `(:Owner)-[:OWNS]->(:Pet)`, `(:Pet)-[:BLOCKED]->(:Pet)` (+5 more)

### Community 41 - "Community 41"
Cohesion: 0.17
Nodes (11): breed, city, limit, page, query, results, species, supabase (+3 more)

### Community 42 - "Community 42"
Cohesion: 0.18
Nodes (11): Block a pet, code:cypher (MERGE (p:Pet {id: $pet_id})), code:cypher (MERGE (o:Owner {id: $owner_id})), code:cypher (MATCH (a:Pet {id: $pet_a_id}), (b:Pet {id: $pet_b_id})), code:cypher (MATCH (a:Pet {id: $pet_a_id})-[r:FRIENDS_WITH]-(b:Pet {id: $), code:cypher (MATCH (a:Pet {id: $from_pet_id}), (b:Pet {id: $to_pet_id})), Core Cypher Queries, Create a friendship (both directions) (+3 more)

### Community 43 - "Community 43"
Cohesion: 0.25
Nodes (7): lat, lng, params, petIds, petsMap, result, supabase

### Community 44 - "Community 44"
Cohesion: 0.29
Nodes (7): code:json ({), code:block24 (friendly, shy, high-energy, calm, dog-selective,), code:typescript (Deno.serve(async (req) => {), code:json ({), code:json ({ "error": "VALIDATION_ERROR", "message": "name is required"), code:json ({ "error": "PET_LIMIT", "message": "Maximum 10 pets per acco), POST /pets `[Edge Function]`

### Community 45 - "Community 45"
Cohesion: 0.22
Nodes (9): code:json ({), code:block24 (INAPPROPRIATE_CONTENT), code:typescript (// 1. Rate limit check), code:json ({), code:swift (let reports = try await supabase), code:json ({), GET /reports/mine `[SDK]`, Moderation & Reports (+1 more)

### Community 46 - "Community 46"
Cohesion: 0.22
Nodes (8): code:swift (// Subscribe to incoming alert notifications), code:json ({), code:json ({), Error Reference (this service), Overview, PawBook — Service: Alerts, Safety & Moderation, Push Notification Payloads (APNs), Realtime: Live Alert Subscription

### Community 47 - "Community 47"
Cohesion: 0.22
Nodes (9): code:json ({), code:json ({), code:json ({ "success": true }), code:json ({), Error, Standard Response Envelope, Success — action (no resource returned), Success — list of resources (+1 more)

### Community 48 - "Community 48"
Cohesion: 0.25
Nodes (7): code:sql (-- Required extensions), code:sql (-- Pets within 10km of a point), code:sql (-- Direct friends of a pet (1 hop)), Graph Query (PostgreSQL fallback — for simple cases only), PawBook — Database Schema: Supabase (PostgreSQL), Setup, Useful Geo Queries

### Community 49 - "Community 49"
Cohesion: 0.25
Nodes (7): code:block1 (AURA_URI=https://<instance-id>.databases.neo4j.io), code:block25 (score = (shared_temperament_traits / total_possible) * 60), code:cypher (MATCH (me:Pet {id: $my_pet_id}), (other:Pet {id: $other_pet_), Compatibility Score Algorithm, Connection, PawBook — Database Schema: Neo4j (Social Graph), Sync Strategy (Neo4j ↔ Supabase)

### Community 50 - "Community 50"
Cohesion: 0.25
Nodes (7): code:block1 (No relationship), code:swift (let channel = supabase.realtimeV2.channel("notifications:\(u), Error Reference (this service), Overview, PawBook — Service: Social Graph, Realtime: Friend Request Notification, Relationship State Machine

### Community 51 - "Community 51"
Cohesion: 0.25
Nodes (7): code:block1 (PENDING   ──► ACCEPTED   ──► SCHEDULED  ──► COMPLETED), code:swift (let channel = supabase.realtimeV2.channel("meetup-rsvp:\(mee), Error Reference (this service), Meetup Lifecycle State Machine, Overview, PawBook — Service: Meetups, Realtime: Live RSVP Updates

### Community 52 - "Community 52"
Cohesion: 0.25
Nodes (7): code:swift (try await supabase), code:json ({ "success": true }), code:typescript (// 1. Find profiles with precise location within radius (Pos), code:json ({), DELETE /location `[SDK]`, GET /location/nearby-pets `[Edge Function]`, User Location Endpoints

### Community 53 - "Community 53"
Cohesion: 0.14
Nodes (19): lastSeenDate, notifications, supabase, invites, scheduledDate, supabase, supabase, supabase (+11 more)

### Community 54 - "Community 54"
Cohesion: 0.29
Nodes (5): code:sql (alter table places enable row level security;), code:sql (alter table meetups enable row level security;), `meetups`, `places`, Tables

### Community 55 - "Community 55"
Cohesion: 0.29
Nodes (7): code:cypher (// Properties), code:cypher ({), code:cypher ({), Node Labels, `Owner`, `Pet`, `Place`

### Community 56 - "Community 56"
Cohesion: 0.29
Nodes (7): code:swift (let friends = try await supabase), code:json ({), code:swift (let requests = try await supabase), code:json ({), Friends List Endpoints, GET /pets/:id/friends `[SDK]`, GET /pets/:id/requests `[SDK]`

### Community 57 - "Community 57"
Cohesion: 0.29
Nodes (6): code:swift (struct Pet: Codable {), code:swift (do {), Edge Function call pattern, Error handling pattern, Supabase SDK Patterns (iOS), Typed model from DB query

### Community 58 - "Community 58"
Cohesion: 0.29
Nodes (7): code:block2 (Authorization: Bearer <supabase_access_token>), code:block3 (Content-Type: application/json), code:block4 (X-Degraded: graph             -- returned when Neo4j is unav), Degraded mode header, Every request (client → server), Every response (server → client), Required Headers

### Community 59 - "Community 59"
Cohesion: 0.07
Nodes (28): params, pathParts, supabase, url, authHeader, participantPetIds, duplicateIds, invites (+20 more)

### Community 60 - "Community 60"
Cohesion: 0.33
Nodes (5): params, petIds, petsMap, result, supabase

### Community 61 - "Community 61"
Cohesion: 0.40
Nodes (5): code:json ({), code:block3 (1-on-1 meetup (is_group=false):), code:typescript (Deno.serve(async (req) => {), code:json ({), POST /meetups `[Edge Function]`

### Community 62 - "Community 62"
Cohesion: 0.40
Nodes (4): code:json ({), code:json ({), code:block8 (off-leash, fenced, water, shade, parking, indoor,), POST /places `[Edge Function]`

### Community 63 - "Community 63"
Cohesion: 0.40
Nodes (4): code:typescript (// Uses pg_trgm index on places.name for fuzzy search), code:json ({), GET /places/search `[Edge Function]`, Place Search

### Community 64 - "Community 64"
Cohesion: 0.40
Nodes (4): code:json ({), code:typescript (Deno.serve(async (req) => {), code:json ({), POST /alerts/lost-pet `[Edge Function]`

### Community 65 - "Community 65"
Cohesion: 0.50
Nodes (3): code:sql (alter table pet_relationships enable row level security;), code:sql (create or replace function sync_relationship_to_neo4j()), `pet_relationships`

### Community 66 - "Community 66"
Cohesion: 0.50
Nodes (3): code:sql (create or replace function update_place_rating()), code:sql (alter table place_reviews enable row level security;), `place_reviews`

### Community 67 - "Community 67"
Cohesion: 0.50
Nodes (3): code:sql (create or replace function handle_new_user()), code:sql (alter table profiles enable row level security;), `profiles`

### Community 68 - "Community 68"
Cohesion: 0.50
Nodes (3): code:sql (create or replace function update_post_like_count()), code:sql (alter table post_reactions enable row level security;), `post_reactions`

### Community 69 - "Community 69"
Cohesion: 0.50
Nodes (3): code:sql (create or replace function update_post_comment_count()), code:sql (alter table comments enable row level security;), `comments`

### Community 70 - "Community 70"
Cohesion: 0.50
Nodes (4): code:json ({ "success": true }), code:json ({), code:typescript (// Either side (requester cancels OR receiver declines)), POST /relationships/decline `[Edge Function]`

### Community 71 - "Community 71"
Cohesion: 0.50
Nodes (4): code:json ({), code:typescript (// 1. Verify caller owns from_pet_id), code:json ({ "success": true }), POST /relationships/block `[Edge Function]`

### Community 72 - "Community 72"
Cohesion: 0.50
Nodes (4): code:json ({), code:typescript (// 1. Verify caller owns accepting_pet_id), code:json ({), POST /relationships/accept `[Edge Function]`

### Community 73 - "Community 73"
Cohesion: 0.40
Nodes (5): code:block12 (file: <image data>  (JPEG or PNG, max 5MB)), code:typescript (// 1. Validate file type and size), code:json ({), code:json ({ "error": "INVALID_FILE", "message": "Only JPEG and PNG all), POST /profile/avatar `[Edge Function]`

### Community 74 - "Community 74"
Cohesion: 0.40
Nodes (4): original, res, wrapped, withCors()

### Community 75 - "Community 75"
Cohesion: 0.50
Nodes (4): code:json ({), code:typescript (// 1. Verify caller owns pet_id), code:json ({), POST /meetups/:id/rsvp `[Edge Function]`

### Community 76 - "Community 76"
Cohesion: 0.50
Nodes (4): code:json ({), code:typescript (// 1. Update status to CANCELLED), code:json ({ "success": true }), PATCH /meetups/:id/cancel `[Edge Function]`

### Community 77 - "Community 77"
Cohesion: 0.50
Nodes (4): code:json ({), code:typescript (// 1. Verify meetup is SCHEDULED and scheduled_at has passed), code:json ({), POST /meetups/:id/complete `[Edge Function]`

### Community 78 - "Community 78"
Cohesion: 0.50
Nodes (4): code:json ({), code:typescript (// 1. Upsert review (allow editing own review)), code:json ({), POST /places/:id/reviews `[Edge Function]`

### Community 79 - "Community 79"
Cohesion: 0.50
Nodes (4): code:cypher (MATCH (p:Pet)-[v:VISITED]->(pl:Place {id: $place_id})), code:typescript (// 1. Query Neo4j for VISITED relationships on this place), code:json ({), GET /places/:id/checkins `[Edge Function]`

### Community 80 - "Community 80"
Cohesion: 0.50
Nodes (3): code:typescript (Deno.serve(async (req) => {), code:json ({), GET /places/nearby `[Edge Function]`

### Community 81 - "Community 81"
Cohesion: 0.50
Nodes (4): code:json ({), code:typescript (// 1. Validate lat/lng ranges), code:json ({ "success": true }), POST /location/update `[Edge Function]`

### Community 82 - "Community 82"
Cohesion: 0.50
Nodes (4): code:json ({), code:typescript (// 1. Check rate limit (count alerts from this user in last ), code:json ({), POST /alerts/community `[Edge Function]`

### Community 83 - "Community 83"
Cohesion: 0.50
Nodes (3): code:typescript (const { data: alerts } = await supabase.rpc("lost_pets_nearb), code:json ({), GET /alerts/lost-pet/nearby `[Edge Function]`

### Community 93 - "Community 93"
Cohesion: 0.67
Nodes (3): code:cypher (MATCH (me:Pet {id: $pet_id})), code:json ({), GET /discover/compatible `[Edge Function]`

### Community 94 - "Community 94"
Cohesion: 0.67
Nodes (3): code:swift (let rel = try await supabase), code:json ({), GET /pets/:id/relationship-status/:other_id `[SDK]`

### Community 95 - "Community 95"
Cohesion: 0.40
Nodes (3): { client }, { client, inserted }, req

### Community 96 - "Community 96"
Cohesion: 0.50
Nodes (4): code:typescript (Deno.serve(async (req) => {), code:json ({ "success": true }), code:json ({), POST /profile/location `[Edge Function]`

### Community 97 - "Community 97"
Cohesion: 0.67
Nodes (3): code:json ({), code:typescript (// 1. Verify caller is organizer), PATCH /meetups/:id/schedule `[Edge Function]`

### Community 98 - "Community 98"
Cohesion: 0.67
Nodes (3): code:swift (let meetup = try await supabase), code:json ({), GET /meetups/:id `[SDK]`

### Community 99 - "Community 99"
Cohesion: 0.67
Nodes (3): code:block12 (HTTP 429 Too Many Requests), code:json ({), Rate Limiting

### Community 100 - "Community 100"
Cohesion: 0.67
Nodes (3): Error Codes, Global error codes (all services), Service-specific codes

### Community 102 - "Community 102"
Cohesion: 0.25
Nodes (5): ForbiddenError, noContent(), res, v, UnauthorizedError

### Community 103 - "Community 103"
Cohesion: 0.10
Nodes (24): expiresAt, notifications, supabase, twentyFourHoursAgo, apnsHost(), ApnsInvalidTokenError, ApnsPayload, base64url() (+16 more)

### Community 104 - "Community 104"
Cohesion: 0.50
Nodes (4): code:json ({), code:typescript (// 1. Verify caller owns the pet (RLS also enforces this)), code:json ({ "error": "AUTH_FORBIDDEN", "message": "You do not own this), PATCH /pets/:id `[Edge Function]`

### Community 105 - "Community 105"
Cohesion: 0.33
Nodes (5): validateImageFile(), adminClient, { data: urlData }, file, supabase

## Knowledge Gaps
- **599 isolated node(s):** `test`, `check`, `lineWidth`, `exclude`, `supabase` (+594 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `errorResponse()` connect `Community 34` to `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 19`, `Community 21`, `Community 23`, `Community 24`, `Community 25`, `Community 26`, `Community 28`, `Community 29`, `Community 30`, `Community 39`, `Community 41`, `Community 43`, `Community 53`, `Community 59`, `Community 60`, `Community 102`, `Community 103`, `Community 105`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `handleCors()` connect `Community 34` to `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 19`, `Community 21`, `Community 23`, `Community 24`, `Community 25`, `Community 26`, `Community 28`, `Community 29`, `Community 30`, `Community 39`, `Community 41`, `Community 43`, `Community 53`, `Community 59`, `Community 60`, `Community 74`, `Community 103`, `Community 105`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `createUserClient()` connect `Community 34` to `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 19`, `Community 21`, `Community 23`, `Community 24`, `Community 25`, `Community 26`, `Community 28`, `Community 29`, `Community 30`, `Community 39`, `Community 41`, `Community 43`, `Community 53`, `Community 59`, `Community 60`, `Community 103`, `Community 105`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `test`, `check`, `lineWidth` to the rest of the system?**
  _599 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._