# PawBook — Service: Feed, Posts, Reactions & Comments

## Overview
The feed service manages all content creation and consumption. Posts belong to pet profiles. The home feed is assembled from posts by pets the user's pets are friends with, plus discovery content. All media is stored in Supabase Storage — the iOS client uploads directly via pre-signed URLs.

---

## Feed Algorithm

```
Home feed for owner X =
  Posts from pets that X's pets are FRIENDS_WITH   (weight: 1.0)
  + Posts from pets that X follows (owner follows)  (weight: 0.8)
  + Trending posts in X's city                      (weight: 0.4)

Sorted by: recency (primary) + engagement score (secondary)
Paginated via cursor (created_at of last item)
```

Feed is assembled in a single Supabase query using the `follows` and `pet_relationships` tables — no Redis cache at MVP. Add caching when query time exceeds 200ms at scale.

---

## Post Endpoints

### GET /feed `[Edge Function]`
Get the home feed for the authenticated user.

**Edge Function: `get-feed`**

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| cursor | timestamptz | null | Pagination cursor (created_at of last post) |
| limit | int | 20 | Max 50 |

**Logic**
```typescript
Deno.serve(async (req) => {
  const user = await getAuthUser(req);
  const { cursor, limit = 20 } = getQueryParams(req);

  // Get all pet IDs owned by user
  const { data: myPets } = await supabase
    .from("pets")
    .select("id")
    .eq("owner_id", user.id)
    .eq("is_active", true);

  const myPetIds = myPets.map(p => p.id);

  // Get friend pet IDs from pet_relationships
  const { data: friendRels } = await supabase
    .from("pet_relationships")
    .select("to_pet_id")
    .in("from_pet_id", myPetIds)
    .eq("rel_type", "FRIEND");

  const friendPetIds = friendRels.map(r => r.to_pet_id);

  // Get following owner IDs
  const { data: followRels } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", user.id);

  const followingOwnerIds = followRels.map(r => r.following_id);

  // Get pet IDs of followed owners
  const { data: followedPets } = await supabase
    .from("pets")
    .select("id")
    .in("owner_id", followingOwnerIds)
    .eq("is_active", true);

  const followedPetIds = followedPets.map(p => p.id);

  // Merge all source pet IDs (deduplicated, excluding own pets)
  const feedPetIds = [...new Set([...friendPetIds, ...followedPetIds])]
    .filter(id => !myPetIds.includes(id));

  // Query posts
  let query = supabase
    .from("posts")
    .select(`
      id, caption, media_urls, media_type, tags,
      like_count, comment_count, created_at,
      pet:pets!pet_id (
        id, name, breed, avatar_url,
        owner:profiles!owner_id (id, display_name, avatar_url, city)
      ),
      place:places!place_id (id, name, type),
      meetup:meetups!meetup_id (id, title)
    `)
    .in("pet_id", feedPetIds)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: posts } = await query;

  // For each post, check if caller's pets have reacted
  const postIds = posts.map(p => p.id);
  const { data: myReactions } = await supabase
    .from("post_reactions")
    .select("post_id, reaction_type, pet_id")
    .in("post_id", postIds)
    .in("pet_id", myPetIds);

  // Merge reactions into posts
  const enrichedPosts = posts.map(post => ({
    ...post,
    my_reaction: myReactions.find(r => r.post_id === post.id) ?? null
  }));

  const nextCursor = posts.length === limit
    ? posts[posts.length - 1].created_at
    : null;

  return ok({ data: enrichedPosts, next_cursor: nextCursor });
});
```

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "caption": "Morning walk at the park! 🐾",
      "media_urls": ["https://...supabase.co/storage/v1/object/public/posts/uuid/img1.jpg"],
      "media_type": "photo",
      "tags": ["morning", "park", "goldenretriever"],
      "like_count": 24,
      "comment_count": 5,
      "created_at": "2024-01-20T08:30:00Z",
      "my_reaction": { "reaction_type": "PAW", "pet_id": "uuid" },
      "pet": {
        "id": "uuid",
        "name": "Max",
        "breed": "Golden Retriever",
        "avatar_url": "https://...",
        "owner": {
          "id": "uuid",
          "display_name": "Sarah Connor",
          "avatar_url": "https://...",
          "city": "San Francisco"
        }
      },
      "place": { "id": "uuid", "name": "Dolores Park", "type": "park" },
      "meetup": null
    }
  ],
  "next_cursor": "2024-01-20T07:00:00Z"
}
```

---

### GET /pets/:id/posts `[SDK]`
Get all posts from a specific pet's profile.

```swift
let posts = try await supabase
    .from("posts")
    .select("""
        id, caption, media_urls, media_type, tags,
        like_count, comment_count, created_at,
        place:places!place_id (id, name, type),
        meetup:meetups!meetup_id (id, title)
    """)
    .eq("pet_id", value: petId)
    .eq("is_active", value: true)
    .order("created_at", ascending: false)
    .limit(20)
    .execute()
```

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "caption": "Best day ever at the beach!",
      "media_urls": ["https://..."],
      "media_type": "photo",
      "tags": ["beach", "summer"],
      "like_count": 42,
      "comment_count": 8,
      "created_at": "2024-01-18T14:00:00Z",
      "place": { "id": "uuid", "name": "Baker Beach", "type": "beach" },
      "meetup": null
    }
  ],
  "next_cursor": "2024-01-15T10:00:00Z"
}
```

---

### GET /posts/:id `[SDK]`
Get a single post with full detail.

```swift
let post = try await supabase
    .from("posts")
    .select("""
        id, caption, media_urls, media_type, tags,
        like_count, comment_count, created_at,
        pet:pets!pet_id (
            id, name, breed, avatar_url,
            owner:profiles!owner_id (id, display_name, avatar_url, city)
        ),
        place:places!place_id (id, name, type, location),
        meetup:meetups!meetup_id (id, title, scheduled_at)
    """)
    .eq("id", value: postId)
    .eq("is_active", value: true)
    .single()
    .execute()
```

**Response 200** — full post object (same shape as feed item)

---

### POST /posts/upload-url `[Edge Function]`
Get a pre-signed URL to upload media directly to Supabase Storage.

**Edge Function: `get-upload-url`**

**Request**
```json
{
  "pet_id": "uuid",
  "file_name": "photo.jpg",
  "content_type": "image/jpeg",
  "file_size_bytes": 2048000
}
```

**Validation**
| Rule | Limit |
|---|---|
| Allowed types | image/jpeg, image/png, image/heic, video/mp4, video/mov |
| Max photo size | 10 MB |
| Max video size | 100 MB |
| Max videos per post | 1 |
| Max photos per post | 10 |

**Logic**
```typescript
// 1. Verify caller owns pet_id
// 2. Validate file type and size
// 3. Generate unique storage path: posts/{pet_id}/{uuid}.jpg
// 4. Create signed upload URL (expires in 300 seconds)
const { data } = await supabase.storage
    .from("posts")
    .createSignedUploadUrl(`${pet_id}/${uuid}.jpg`);
```

**Response 200**
```json
{
  "upload_url": "https://...supabase.co/storage/v1/object/sign/posts/uuid/uuid.jpg?token=...",
  "storage_path": "posts/uuid/uuid.jpg",
  "public_url": "https://...supabase.co/storage/v1/object/public/posts/uuid/uuid.jpg",
  "expires_in": 300
}
```

---

### POST /posts `[Edge Function]`
Create a post after media has been uploaded.

**Edge Function: `create-post`**

**Request**
```json
{
  "pet_id": "uuid",
  "caption": "Morning walk at the park!",
  "media_urls": ["https://...supabase.co/storage/v1/object/public/posts/uuid/img1.jpg"],
  "media_type": "photo",
  "tags": ["morning", "park"],
  "place_id": "uuid",
  "meetup_id": null
}
```

**Validation**
| Field | Rule |
|---|---|
| pet_id | Required, caller must own it |
| caption | Optional, max 500 chars |
| media_urls | Optional, max 10 items, must be valid Supabase Storage URLs |
| media_type | Required if media_urls present — photo or video |
| tags | Optional, max 20 tags, each max 30 chars |
| place_id | Optional, must exist |

**Logic**
```typescript
// 1. Verify caller owns pet_id
// 2. Validate all media_urls are in our Supabase Storage (prevent hotlinking)
// 3. Insert post
// 4. If place_id: update place's Neo4j node with recent activity
// 5. Return created post
```

**Response 201**
```json
{
  "id": "uuid",
  "pet_id": "uuid",
  "caption": "Morning walk at the park!",
  "media_urls": ["https://..."],
  "media_type": "photo",
  "tags": ["morning", "park"],
  "like_count": 0,
  "comment_count": 0,
  "place_id": "uuid",
  "meetup_id": null,
  "is_active": true,
  "created_at": "2024-01-20T08:30:00Z"
}
```

---

### PATCH /posts/:id `[SDK]`
Update caption or tags of a post. Media cannot be changed after creation.

```swift
try await supabase
    .from("posts")
    .update(["caption": newCaption, "tags": newTags, "updated_at": now()])
    .eq("id", value: postId)
    .execute()
// RLS ensures only the pet's owner can update
```

**Request**
```json
{
  "caption": "Updated caption",
  "tags": ["updated", "tags"]
}
```

**Response 200** — updated post object

---

### DELETE /posts/:id `[SDK]`
Soft-delete a post.

```swift
try await supabase
    .from("posts")
    .update(["is_active": false, "updated_at": now()])
    .eq("id", value: postId)
    .execute()
// RLS ensures only pet owner can soft-delete
```

**Response 200**
```json
{ "success": true }
```

---

## Reaction Endpoints

### POST /posts/:id/react `[Edge Function]`
Add or change a reaction on a post. One reaction per pet per post.

**Edge Function: `react-to-post`**

**Request**
```json
{
  "pet_id": "uuid",
  "reaction_type": "PAW"
}
```

Allowed `reaction_type` values: `PAW`, `BONE`, `HEART`

**Logic**
```typescript
// 1. Verify caller owns pet_id
// 2. Upsert into post_reactions (unique on post_id + pet_id)
// 3. DB trigger handles like_count increment
// 4. Notify post owner (skip if reacting to own post)

await supabase.from("post_reactions").upsert({
    post_id: postId,
    pet_id,
    reaction_type
}, { onConflict: "post_id,pet_id" });
```

**Response 200**
```json
{
  "post_id": "uuid",
  "pet_id": "uuid",
  "reaction_type": "PAW",
  "created_at": "2024-01-20T09:00:00Z"
}
```

---

### DELETE /posts/:id/react `[SDK]`
Remove a reaction.

```swift
try await supabase
    .from("post_reactions")
    .delete()
    .eq("post_id", value: postId)
    .eq("pet_id", value: petId)
    .execute()
// RLS ensures only pet owner can delete their reaction
// DB trigger handles like_count decrement
```

**Response 200**
```json
{ "success": true }
```

---

### GET /posts/:id/reactions `[SDK]`
Get all reactions on a post, grouped by type.

```swift
let reactions = try await supabase
    .from("post_reactions")
    .select("""
        reaction_type,
        pet:pets!pet_id (id, name, avatar_url)
    """)
    .eq("post_id", value: postId)
    .order("created_at", ascending: false)
    .execute()
```

**Response 200**
```json
{
  "total": 24,
  "by_type": {
    "PAW": 15,
    "BONE": 6,
    "HEART": 3
  },
  "recent": [
    {
      "reaction_type": "PAW",
      "pet": { "id": "uuid", "name": "Bella", "avatar_url": "https://..." }
    }
  ]
}
```

---

## Comment Endpoints

### GET /posts/:id/comments `[SDK]`
Get top-level comments with first-level replies.

```swift
let comments = try await supabase
    .from("comments")
    .select("""
        id, body, created_at, parent_id,
        author:pets!author_pet_id (id, name, avatar_url,
            owner:profiles!owner_id (id, display_name)
        )
    """)
    .eq("post_id", value: postId)
    .eq("is_active", value: true)
    .is("parent_id", value: nil)   // top-level only
    .order("created_at", ascending: true)
    .limit(50)
    .execute()
```

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "body": "Such a cute photo! 🐾",
      "created_at": "2024-01-20T09:15:00Z",
      "parent_id": null,
      "reply_count": 2,
      "author": {
        "id": "uuid",
        "name": "Bella",
        "avatar_url": "https://...",
        "owner": { "id": "uuid", "display_name": "James Wilson" }
      }
    }
  ],
  "next_cursor": "2024-01-20T10:00:00Z"
}
```

---

### GET /comments/:id/replies `[SDK]`
Get replies to a specific comment.

```swift
let replies = try await supabase
    .from("comments")
    .select("""
        id, body, created_at,
        author:pets!author_pet_id (id, name, avatar_url,
            owner:profiles!owner_id (id, display_name)
        )
    """)
    .eq("parent_id", value: commentId)
    .eq("is_active", value: true)
    .order("created_at", ascending: true)
    .execute()
```

**Response 200** — array of comment objects (same shape, no `reply_count`)

---

### POST /posts/:id/comments `[Edge Function]`
Add a comment to a post.

**Edge Function: `add-comment`**

**Request**
```json
{
  "pet_id": "uuid",
  "body": "Such a cute photo!",
  "parent_id": null
}
```

**Validation**
| Field | Rule |
|---|---|
| pet_id | Required, caller must own it |
| body | Required, 1–500 chars |
| parent_id | Optional UUID — must reference a top-level comment on same post |

**Logic**
```typescript
// 1. Verify caller owns pet_id
// 2. If parent_id: verify it belongs to the same post and is top-level
// 3. Insert comment
// 4. DB trigger increments post.comment_count
// 5. Notify post owner (if not own post) and parent comment author (if reply)
```

**Response 201**
```json
{
  "id": "uuid",
  "post_id": "uuid",
  "author_pet_id": "uuid",
  "parent_id": null,
  "body": "Such a cute photo!",
  "is_active": true,
  "created_at": "2024-01-20T09:15:00Z"
}
```

---

### DELETE /comments/:id `[SDK]`
Soft-delete a comment (set `is_active = false`).

```swift
try await supabase
    .from("comments")
    .update(["is_active": false])
    .eq("id", value: commentId)
    .execute()
// RLS: only the comment author's owner can soft-delete
// DB trigger decrements post.comment_count
```

**Response 200**
```json
{ "success": true }
```

---

## Explore / Discover Feed

### GET /explore `[Edge Function]`
Explore feed — trending posts in user's city, not from friends.

**Edge Function: `get-explore`**

**Query Parameters**
| Param | Type | Default |
|---|---|---|
| city | string | from caller's profile |
| species | string | null |
| tag | string | null |
| cursor | timestamptz | null |
| limit | int | 30 |

**Logic**
```typescript
// Posts from last 7 days, in caller's city, not from their pets or friends
// Sorted by: (like_count * 2 + comment_count) DESC, then created_at DESC

const { data: posts } = await supabase
    .from("posts")
    .select(`
        id, caption, media_urls, media_type, tags,
        like_count, comment_count, created_at,
        pet:pets!pet_id (
            id, name, breed, avatar_url,
            owner:profiles!owner_id (display_name, city)
        )
    `)
    .eq("is_active", true)
    .not("pet_id", "in", `(${myAndFriendPetIds.join(",")})`)
    .gte("created_at", sevenDaysAgo)
    .order("like_count", { ascending: false })
    .limit(limit);
```

**Response 200** — same shape as `/feed` response, no `my_reaction`

---

## Realtime: Live Like Count

Subscribe to a post's reaction count in real time while viewing it.

```swift
let channel = supabase.realtimeV2.channel("post:\(postId)")

channel.onPostgresChanges(
    AnyAction.self,
    schema: "public",
    table: "posts",
    filter: "id=eq.\(postId)"
) { change in
    if case .update(let record) = change {
        updateLikeCount(record.likeCount)
        updateCommentCount(record.commentCount)
    }
}

await channel.subscribe()
```

---

## Storage Buckets

| Bucket | Access | Contents |
|---|---|---|
| `posts` | Public read | Post photos and videos |
| `avatars` | Public read | Profile and pet avatars |
| `pet-avatars` | Public read | Pet profile photos |
| `vax-docs` | Private (owner only) | Vaccination certificates |

**Storage path conventions**
```
posts/{pet_id}/{uuid}.jpg          -- post media
avatars/{user_id}/profile.jpg      -- owner avatar
pet-avatars/{pet_id}/avatar.jpg    -- pet avatar
vax-docs/{pet_id}/{record_id}.pdf  -- vaccination docs
```

---

## Error Reference (this service)

| Code | HTTP | Meaning |
|---|---|---|
| `NOT_FOUND` | 404 | Post or comment not found or inactive |
| `AUTH_FORBIDDEN` | 403 | Caller does not own the pet |
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `INVALID_FILE` | 400 | File type or size not allowed |
| `INVALID_MEDIA_URL` | 400 | URL is not a valid Supabase Storage URL |
| `INVALID_PARENT` | 400 | parent_id does not belong to this post |
| `DUPLICATE_REACTION` | 409 | Pet already reacted (use upsert to change) |
