# PawBook — Service: User & Pet

## Base URL
All endpoints are Supabase Edge Functions unless marked `[SDK]` (direct Supabase SDK call from iOS — no Edge Function needed).

```
Production:  https://<project-ref>.supabase.co/functions/v1
Staging:     https://<staging-ref>.supabase.co/functions/v1
```

## Auth Header (required on all endpoints)
```
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

---

## User (Profile) Endpoints

### GET /profile/me `[SDK]`
Get the authenticated user's own profile.

```swift
// iOS — direct SDK call, no Edge Function
let profile = try await supabase
    .from("profiles")
    .select("""
        id, display_name, avatar_url, bio, city, location,
        created_at,
        pets (id, name, species, breed, avatar_url, temperament, is_vaccinated)
    """)
    .eq("id", value: userId)
    .single()
    .execute()
```

**Response 200**
```json
{
  "id": "uuid",
  "display_name": "Sarah Connor",
  "avatar_url": "https://....supabase.co/storage/v1/object/public/avatars/uuid.jpg",
  "bio": "Dog mom of 2 in SF 🐾",
  "city": "San Francisco",
  "location": { "lat": 37.77, "lng": -122.41 },
  "created_at": "2024-01-15T10:00:00Z",
  "pets": [
    {
      "id": "uuid",
      "name": "Max",
      "species": "dog",
      "breed": "Golden Retriever",
      "avatar_url": "https://...",
      "temperament": ["friendly", "high-energy"],
      "is_vaccinated": true
    }
  ]
}
```

---

### GET /profile/:id `[SDK]`
Get any public profile by ID.

```swift
let profile = try await supabase
    .from("profiles")
    .select("""
        id, display_name, avatar_url, bio, city,
        pets (id, name, species, breed, avatar_url, temperament, is_vaccinated, size)
    """)
    .eq("id", value: profileId)
    .eq("is_active", value: true)
    .single()
    .execute()
```

**Response 200** — same shape as `/profile/me` without `location`

**Response 404**
```json
{ "error": "NOT_FOUND", "message": "Profile not found" }
```

---

### PATCH /profile/me `[SDK]`
Update authenticated user's profile.

**Request**
```json
{
  "display_name": "Sarah Connor",
  "bio": "Dog mom of 2 🐾",
  "city": "San Francisco"
}
```

```swift
try await supabase
    .from("profiles")
    .update([
        "display_name": displayName,
        "bio": bio,
        "city": city,
        "updated_at": ISO8601DateFormatter().string(from: Date())
    ])
    .eq("id", value: userId)
    .execute()
```

**Response 200** — updated profile object

**Validation**
| Field | Rule |
|---|---|
| display_name | Required, 2–50 chars |
| bio | Optional, max 200 chars |
| city | Optional, max 100 chars |

---

### POST /profile/location `[Edge Function]`
Update user's location (opt-in, precise). Syncs to Neo4j Owner node.

**Edge Function: `update-location`**

**Request**
```json
{
  "lat": 37.7749,
  "lng": -122.4194,
  "city": "San Francisco"
}
```

**Edge Function Logic**
```typescript
Deno.serve(async (req) => {
  const { lat, lng, city } = await req.json();
  const user = await getAuthUser(req);

  // Update Supabase
  await supabase.from("profiles").update({
    location: `POINT(${lng} ${lat})`,
    city,
    updated_at: new Date().toISOString()
  }).eq("id", user.id);

  // Sync to Neo4j
  await neo4jQuery(`
    MERGE (o:Owner {id: $owner_id})
    SET o.lat = $lat, o.lng = $lng, o.city = $city
  `, { owner_id: user.id, lat, lng, city });

  return ok();
});
```

**Response 200**
```json
{ "success": true }
```

---

### POST /profile/avatar `[Edge Function]`
Upload profile avatar to Supabase Storage.

**Edge Function: `upload-avatar`**

**Request** — `multipart/form-data`
```
file: <image data>  (JPEG or PNG, max 5MB)
```

**Logic**
```typescript
// 1. Validate file type and size
// 2. Upload to Supabase Storage bucket: "avatars"
// 3. Path: avatars/{user_id}/profile.jpg
// 4. Update profiles.avatar_url with public URL
// 5. Return public URL
```

**Response 200**
```json
{
  "avatar_url": "https://<ref>.supabase.co/storage/v1/object/public/avatars/uuid/profile.jpg"
}
```

**Response 400**
```json
{ "error": "INVALID_FILE", "message": "Only JPEG and PNG allowed, max 5MB" }
```

---

### DELETE /profile/me `[Edge Function]`
Soft-delete account. Sets `is_active = false`.

**Edge Function: `delete-account`**

**Logic**
```typescript
// 1. Set profiles.is_active = false
// 2. Set all pets.is_active = false
// 3. Set Neo4j Pet nodes: is_active = false
// 4. Cancel all PENDING/SCHEDULED meetups where organizer
// 5. DO NOT delete auth.users (retained for 30 days per data policy)
// 6. Sign out all sessions: supabase.auth.admin.signOut(userId)
```

**Request** — requires confirmation
```json
{ "confirm": "DELETE MY ACCOUNT" }
```

**Response 200**
```json
{ "success": true, "message": "Account deactivated. Data retained for 30 days." }
```

---

## Pet Endpoints

### GET /pets `[SDK]`
Get all pets belonging to the authenticated user.

```swift
let pets = try await supabase
    .from("pets")
    .select("""
        id, name, species, breed, dob, gender, bio,
        avatar_url, temperament, size, is_vaccinated, created_at,
        vaccination_records (id, vaccine_name, administered_on, expires_on, verified)
    """)
    .eq("owner_id", value: userId)
    .eq("is_active", value: true)
    .order("created_at", ascending: true)
    .execute()
```

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Max",
      "species": "dog",
      "breed": "Golden Retriever",
      "dob": "2020-03-15",
      "gender": "male",
      "bio": "Loves fetch and belly rubs",
      "avatar_url": "https://...",
      "temperament": ["friendly", "high-energy"],
      "size": "large",
      "is_vaccinated": true,
      "created_at": "2024-01-15T10:00:00Z",
      "vaccination_records": [
        {
          "id": "uuid",
          "vaccine_name": "Rabies",
          "administered_on": "2024-01-01",
          "expires_on": "2025-01-01",
          "verified": true
        }
      ]
    }
  ]
}
```

---

### GET /pets/:id `[SDK]`
Get a single pet profile. Public — any authenticated user can view active pets.

```swift
let pet = try await supabase
    .from("pets")
    .select("""
        id, name, species, breed, dob, gender, bio,
        avatar_url, temperament, size, is_vaccinated, created_at,
        profiles!owner_id (id, display_name, avatar_url, city),
        vaccination_records (vaccine_name, administered_on, expires_on, verified)
    """)
    .eq("id", value: petId)
    .eq("is_active", value: true)
    .single()
    .execute()
```

**Response 200**
```json
{
  "id": "uuid",
  "name": "Max",
  "species": "dog",
  "breed": "Golden Retriever",
  "dob": "2020-03-15",
  "gender": "male",
  "bio": "Loves fetch and belly rubs",
  "avatar_url": "https://...",
  "temperament": ["friendly", "high-energy"],
  "size": "large",
  "is_vaccinated": true,
  "owner": {
    "id": "uuid",
    "display_name": "Sarah Connor",
    "avatar_url": "https://...",
    "city": "San Francisco"
  },
  "vaccination_records": [
    {
      "vaccine_name": "Rabies",
      "administered_on": "2024-01-01",
      "expires_on": "2025-01-01",
      "verified": true
    }
  ]
}
```

---

### POST /pets `[Edge Function]`
Create a new pet. Syncs node to Neo4j.

**Edge Function: `create-pet`**

**Request**
```json
{
  "name": "Max",
  "species": "dog",
  "breed": "Golden Retriever",
  "dob": "2020-03-15",
  "gender": "male",
  "bio": "Loves fetch and belly rubs",
  "temperament": ["friendly", "high-energy"],
  "size": "large"
}
```

**Validation**
| Field | Rule |
|---|---|
| name | Required, 1–50 chars |
| species | Required — one of: dog, cat, rabbit, bird, other |
| breed | Optional, max 100 chars |
| dob | Optional, must be in the past, max 30 years ago |
| gender | Optional — male, female, unknown |
| bio | Optional, max 300 chars |
| temperament | Optional, array, values from allowed list |
| size | Optional — small, medium, large, xlarge |

**Allowed temperament values**
```
friendly, shy, high-energy, calm, dog-selective,
cat-friendly, good-with-kids, protective, playful, independent
```

**Edge Function Logic**
```typescript
Deno.serve(async (req) => {
  const user = await getAuthUser(req);
  const body = await req.json();

  // 1. Validate input
  validate(body);

  // 2. Check pet limit (max 10 pets per owner)
  const { count } = await supabase
    .from("pets")
    .select("id", { count: "exact" })
    .eq("owner_id", user.id)
    .eq("is_active", true);

  if (count >= 10) throw new AppError("PET_LIMIT", "Maximum 10 pets per account", 400);

  // 3. Insert pet in Supabase
  const { data: pet } = await supabase
    .from("pets")
    .insert({ ...body, owner_id: user.id })
    .select()
    .single();

  // 4. Get owner location for Neo4j
  const { data: profile } = await supabase
    .from("profiles")
    .select("city, location")
    .eq("id", user.id)
    .single();

  // 5. Create Pet node in Neo4j
  await neo4jQuery(`
    MERGE (p:Pet {id: $id})
    SET p.name = $name, p.species = $species, p.breed = $breed,
        p.temperament = $temperament, p.size = $size,
        p.is_vaccinated = $is_vaccinated, p.owner_id = $owner_id,
        p.city = $city, p.created_at = $created_at
    WITH p
    MERGE (o:Owner {id: $owner_id})
    MERGE (o)-[:OWNS {since: $created_at}]->(p)
  `, { ...pet, city: profile.city });

  return created(pet);
});
```

**Response 201**
```json
{
  "id": "uuid",
  "name": "Max",
  "species": "dog",
  "breed": "Golden Retriever",
  "owner_id": "uuid",
  "temperament": ["friendly", "high-energy"],
  "size": "large",
  "is_vaccinated": false,
  "is_active": true,
  "created_at": "2024-01-15T10:00:00Z"
}
```

**Response 400**
```json
{ "error": "VALIDATION_ERROR", "message": "name is required", "field": "name" }
```

**Response 400**
```json
{ "error": "PET_LIMIT", "message": "Maximum 10 pets per account" }
```

---

### PATCH /pets/:id `[Edge Function]`
Update a pet's profile. Syncs to Neo4j.

**Edge Function: `update-pet`**

**Request** — all fields optional
```json
{
  "name": "Maxwell",
  "bio": "Updated bio",
  "temperament": ["friendly", "calm"],
  "is_vaccinated": true
}
```

**Logic**
```typescript
// 1. Verify caller owns the pet (RLS also enforces this)
// 2. Update Supabase pets row
// 3. Sync changed fields to Neo4j Pet node
// 4. Return updated pet
```

**Response 200** — updated pet object

**Response 403**
```json
{ "error": "AUTH_FORBIDDEN", "message": "You do not own this pet" }
```

---

### POST /pets/:id/avatar `[Edge Function]`
Upload pet avatar.

**Edge Function: `upload-pet-avatar`**

**Request** — `multipart/form-data`
```
file: <image data>  (JPEG or PNG, max 5MB)
```

**Storage path**: `pet-avatars/{pet_id}/avatar.jpg`

**Response 200**
```json
{
  "avatar_url": "https://<ref>.supabase.co/storage/v1/object/public/pet-avatars/uuid/avatar.jpg"
}
```

---

### DELETE /pets/:id `[Edge Function]`
Soft-delete a pet.

**Edge Function: `delete-pet`**

**Logic**
```typescript
// 1. Verify caller owns the pet
// 2. Set pets.is_active = false
// 3. Set Neo4j Pet node: is_active = false
// 4. Cancel any PENDING meetups involving this pet
// 5. Remove FRIENDS_WITH relationships from Neo4j (but keep VISITED history)
```

**Response 200**
```json
{ "success": true }
```

---

## Vaccination Record Endpoints

### POST /pets/:id/vaccinations `[SDK]`
Add a vaccination record.

**Request**
```json
{
  "vaccine_name": "Rabies",
  "administered_on": "2024-01-01",
  "expires_on": "2025-01-01"
}
```

```swift
try await supabase
    .from("vaccination_records")
    .insert([
        "pet_id": petId,
        "vaccine_name": vaccineName,
        "administered_on": administeredOn,
        "expires_on": expiresOn
    ])
    .execute()
```

**Response 201**
```json
{
  "id": "uuid",
  "pet_id": "uuid",
  "vaccine_name": "Rabies",
  "administered_on": "2024-01-01",
  "expires_on": "2025-01-01",
  "verified": false
}
```

---

### POST /pets/:id/vaccinations/:record_id/document `[Edge Function]`
Upload a vaccination certificate document.

**Edge Function: `upload-vax-doc`**

**Request** — `multipart/form-data`
```
file: <PDF or image, max 10MB>
```

**Storage path**: `vax-docs/{pet_id}/{record_id}.pdf`

**Logic**
```typescript
// 1. Verify caller owns the pet
// 2. Upload file to Supabase Storage (private bucket)
// 3. Update vaccination_records.doc_url
// 4. If upload successful, update pets.is_vaccinated = true
```

**Response 200**
```json
{
  "doc_url": "https://...",
  "is_vaccinated": true
}
```

---

## Search Endpoints

### GET /search/pets `[Edge Function]`
Search pets by name, breed, or temperament.

**Edge Function: `search-pets`**

**Query Parameters**
| Param | Type | Description |
|---|---|---|
| q | string | Search term (name or breed) |
| species | string | Filter by species |
| breed | string | Exact breed filter |
| temperament | string[] | Filter by temperament tags |
| city | string | Filter by city |
| page | int | Default 1 |
| limit | int | Default 20, max 50 |

**Example**
```
GET /search/pets?q=golden&species=dog&city=San+Francisco&limit=20
```

**Logic**
```typescript
// Uses PostgreSQL pg_trgm index for fuzzy name/breed search
const { data } = await supabase
    .from("pets")
    .select("id, name, species, breed, avatar_url, temperament, size, is_vaccinated, profiles!owner_id(city)")
    .eq("is_active", true)
    .textSearch("name", query, { type: "websearch" })
    .eq("species", species)
    .contains("temperament", temperamentFilter)
    .range(offset, offset + limit - 1);
```

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Max",
      "species": "dog",
      "breed": "Golden Retriever",
      "avatar_url": "https://...",
      "temperament": ["friendly", "high-energy"],
      "size": "large",
      "is_vaccinated": true,
      "city": "San Francisco"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 143,
    "has_more": true
  }
}
```

---

## Error Reference (this service)

| Code | HTTP | Meaning |
|---|---|---|
| `NOT_FOUND` | 404 | Pet or profile does not exist or is inactive |
| `AUTH_FORBIDDEN` | 403 | Caller does not own this pet/profile |
| `VALIDATION_ERROR` | 400 | Input failed validation — see `field` property |
| `PET_LIMIT` | 400 | Owner already has 10 active pets |
| `INVALID_FILE` | 400 | File type or size not allowed |
| `DUPLICATE` | 409 | Unique constraint violation (e.g. duplicate reaction) |
