# PawBook — Database Schema: Supabase (PostgreSQL)

## Setup

```sql
-- Required extensions
create extension if not exists postgis;       -- geo queries
create extension if not exists "uuid-ossp";   -- uuid generation (fallback)
create extension if not exists pg_trgm;       -- fuzzy text search on breed/name
```

---

## Tables

### `profiles`
Extends Supabase `auth.users`. Created automatically on signup via trigger.

```sql
create table profiles (
  id              uuid primary key references auth.users on delete cascade,
  display_name    text not null,
  avatar_url      text,
  bio             text,
  city            text,
  location        geography(Point, 4326),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index profiles_location_idx on profiles using gist(location);
create index profiles_city_idx on profiles(city);
```

**Trigger: auto-create profile on signup**
```sql
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'Pet Owner'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
```

**RLS Policies**
```sql
alter table profiles enable row level security;

-- Anyone can read any active profile
create policy "profiles_select" on profiles
  for select using (is_active = true);

-- Only owner can update their own profile
create policy "profiles_update" on profiles
  for update using (auth.uid() = id);
```

---

### `pets`
Core entity. One owner can have multiple pets.

```sql
create table pets (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references profiles(id) on delete cascade,
  name            text not null,
  species         text not null,                    -- dog, cat, rabbit, bird, other
  breed           text,
  dob             date,
  gender          text check (gender in ('male','female','unknown')),
  bio             text,
  avatar_url      text,
  temperament     text[] default '{}',              -- friendly, shy, high-energy, calm, dog-selective
  size            text check (size in ('small','medium','large','xlarge')),
  is_vaccinated   boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index pets_owner_idx on pets(owner_id);
create index pets_breed_idx on pets(breed);
create index pets_species_idx on pets(species);
create index pets_name_trgm_idx on pets using gin(name gin_trgm_ops);
```

**RLS Policies**
```sql
alter table pets enable row level security;

-- Anyone can view active pets
create policy "pets_select" on pets
  for select using (is_active = true);

-- Only owner can insert pets
create policy "pets_insert" on pets
  for insert with check (auth.uid() = owner_id);

-- Only owner can update/soft-delete
create policy "pets_update" on pets
  for update using (auth.uid() = owner_id);
```

---

### `vaccination_records`
Vet documents uploaded to Supabase Storage.

```sql
create table vaccination_records (
  id              uuid primary key default gen_random_uuid(),
  pet_id          uuid not null references pets(id) on delete cascade,
  vaccine_name    text not null,
  administered_on date not null,
  expires_on      date,
  doc_url         text,                             -- Supabase Storage path
  verified        boolean not null default false,
  created_at      timestamptz not null default now()
);

create index vacc_pet_idx on vaccination_records(pet_id);
```

**RLS Policies**
```sql
alter table vaccination_records enable row level security;

-- Owner can read their pet's records; others can see only verified ones
create policy "vacc_select_own" on vaccination_records
  for select using (
    exists (
      select 1 from pets
      where pets.id = vaccination_records.pet_id
      and pets.owner_id = auth.uid()
    )
    or verified = true
  );

create policy "vacc_insert" on vaccination_records
  for insert with check (
    exists (
      select 1 from pets
      where pets.id = vaccination_records.pet_id
      and pets.owner_id = auth.uid()
    )
  );
```

---

### `pet_relationships`
Adjacency list representing the social graph. Also used for graph sync to Neo4j.

```sql
create table pet_relationships (
  id              uuid primary key default gen_random_uuid(),
  from_pet_id     uuid not null references pets(id) on delete cascade,
  to_pet_id       uuid not null references pets(id) on delete cascade,
  rel_type        text not null check (rel_type in ('FRIEND_REQ','FRIEND','BLOCKED')),
  compatibility   int2 check (compatibility between 0 and 100),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(from_pet_id, to_pet_id)
);

create index rel_from_idx on pet_relationships(from_pet_id);
create index rel_to_idx on pet_relationships(to_pet_id);
create index rel_type_idx on pet_relationships(rel_type);
```

**RLS Policies**
```sql
alter table pet_relationships enable row level security;

create policy "rel_select" on pet_relationships
  for select using (
    exists (
      select 1 from pets
      where pets.id in (from_pet_id, to_pet_id)
      and pets.owner_id = auth.uid()
    )
  );

create policy "rel_insert" on pet_relationships
  for insert with check (
    exists (
      select 1 from pets
      where pets.id = from_pet_id
      and pets.owner_id = auth.uid()
    )
  );

create policy "rel_update" on pet_relationships
  for update using (
    exists (
      select 1 from pets
      where pets.id in (from_pet_id, to_pet_id)
      and pets.owner_id = auth.uid()
    )
  );
```

**Trigger: sync to Neo4j on relationship change**
```sql
create or replace function sync_relationship_to_neo4j()
returns trigger language plpgsql security definer as $$
begin
  perform net.http_post(
    url := current_setting('app.neo4j_sync_url'),
    body := json_build_object(
      'event', TG_OP,
      'from_pet_id', NEW.from_pet_id,
      'to_pet_id', NEW.to_pet_id,
      'rel_type', NEW.rel_type
    )::text,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  return NEW;
end;
$$;

create trigger rel_neo4j_sync
  after insert or update on pet_relationships
  for each row execute procedure sync_relationship_to_neo4j();
```

---

### `follows`
Owner-to-owner follow (for feed purposes).

```sql
create table follows (
  follower_id     uuid not null references profiles(id) on delete cascade,
  following_id    uuid not null references profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id != following_id)
);

create index follows_following_idx on follows(following_id);
```

**RLS Policies**
```sql
alter table follows enable row level security;

create policy "follows_select" on follows for select using (true);

create policy "follows_insert" on follows
  for insert with check (auth.uid() = follower_id);

create policy "follows_delete" on follows
  for delete using (auth.uid() = follower_id);
```

---

### `places`
Dog parks, pet cafes, trails, beaches.

```sql
create table places (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            text not null check (type in ('park','cafe','trail','beach','vet','groomer','other')),
  location        geography(Point, 4326) not null,
  address         text,
  avg_rating      numeric(3,2) default 0,
  review_count    int4 default 0,
  tags            text[] default '{}',              -- off-leash, fenced, water, shade
  added_by        uuid references profiles(id),
  is_verified     boolean default false,
  is_active       boolean default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index places_location_idx on places using gist(location);
create index places_type_idx on places(type);
create index places_name_trgm_idx on places using gin(name gin_trgm_ops);
```

**RLS Policies**
```sql
alter table places enable row level security;

create policy "places_select" on places
  for select using (is_active = true);

create policy "places_insert" on places
  for insert with check (auth.uid() is not null);

create policy "places_update" on places
  for update using (auth.uid() = added_by);
```

---

### `place_reviews`
Community ratings for places.

```sql
create table place_reviews (
  id              uuid primary key default gen_random_uuid(),
  place_id        uuid not null references places(id) on delete cascade,
  author_id       uuid not null references profiles(id) on delete cascade,
  rating          int2 not null check (rating between 1 and 5),
  body            text,
  created_at      timestamptz not null default now(),
  unique(place_id, author_id)
);

create index pr_place_idx on place_reviews(place_id);
```

**Trigger: update avg_rating on places**
```sql
create or replace function update_place_rating()
returns trigger language plpgsql as $$
begin
  update places set
    avg_rating = (select avg(rating) from place_reviews where place_id = NEW.place_id),
    review_count = (select count(*) from place_reviews where place_id = NEW.place_id),
    updated_at = now()
  where id = NEW.place_id;
  return NEW;
end;
$$;

create trigger place_rating_update
  after insert or update or delete on place_reviews
  for each row execute procedure update_place_rating();
```

**RLS Policies**
```sql
alter table place_reviews enable row level security;

create policy "pr_select" on place_reviews for select using (true);

create policy "pr_insert" on place_reviews
  for insert with check (auth.uid() = author_id);

create policy "pr_update" on place_reviews
  for update using (auth.uid() = author_id);
```

---

### `meetups`
Core meetup entity.

```sql
create table meetups (
  id                uuid primary key default gen_random_uuid(),
  organizer_id      uuid not null references profiles(id) on delete cascade,
  place_id          uuid references places(id),
  title             text not null,
  description       text,
  status            text not null default 'PENDING'
                      check (status in ('PENDING','ACCEPTED','SCHEDULED','COMPLETED','CANCELLED')),
  scheduled_at      timestamptz,
  max_pets          int2 default 10,
  is_group          boolean not null default false,
  custom_location   geography(Point, 4326),
  custom_address    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index meetups_organizer_idx on meetups(organizer_id);
create index meetups_place_idx on meetups(place_id);
create index meetups_status_idx on meetups(status);
create index meetups_scheduled_idx on meetups(scheduled_at);
```

**RLS Policies**
```sql
alter table meetups enable row level security;

-- Participants and organizer can view meetup
create policy "meetups_select" on meetups
  for select using (
    auth.uid() = organizer_id
    or exists (
      select 1 from meetup_participants mp
      join pets p on p.id = mp.pet_id
      where mp.meetup_id = meetups.id
      and p.owner_id = auth.uid()
    )
  );

create policy "meetups_insert" on meetups
  for insert with check (auth.uid() = organizer_id);

create policy "meetups_update" on meetups
  for update using (auth.uid() = organizer_id);
```

---

### `meetup_participants`
Which pets attend which meetup.

```sql
create table meetup_participants (
  id              uuid primary key default gen_random_uuid(),
  meetup_id       uuid not null references meetups(id) on delete cascade,
  pet_id          uuid not null references pets(id) on delete cascade,
  rsvp_status     text not null default 'INVITED'
                    check (rsvp_status in ('INVITED','ACCEPTED','DECLINED')),
  invited_by      uuid references profiles(id),
  joined_at       timestamptz not null default now(),
  unique(meetup_id, pet_id)
);

create index mp_meetup_idx on meetup_participants(meetup_id);
create index mp_pet_idx on meetup_participants(pet_id);
```

**RLS Policies**
```sql
alter table meetup_participants enable row level security;

create policy "mp_select" on meetup_participants
  for select using (
    exists (
      select 1 from pets p
      where p.id = meetup_participants.pet_id
      and p.owner_id = auth.uid()
    )
    or exists (
      select 1 from meetups m
      where m.id = meetup_participants.meetup_id
      and m.organizer_id = auth.uid()
    )
  );

create policy "mp_insert" on meetup_participants
  for insert with check (
    exists (
      select 1 from meetups m
      where m.id = meetup_id
      and m.organizer_id = auth.uid()
    )
  );

create policy "mp_update_own" on meetup_participants
  for update using (
    exists (
      select 1 from pets p
      where p.id = meetup_participants.pet_id
      and p.owner_id = auth.uid()
    )
  );
```

---

### `posts`
Feed posts from pet profiles.

```sql
create table posts (
  id              uuid primary key default gen_random_uuid(),
  pet_id          uuid not null references pets(id) on delete cascade,
  meetup_id       uuid references meetups(id),
  place_id        uuid references places(id),
  caption         text,
  media_urls      text[] default '{}',
  media_type      text check (media_type in ('photo','video','text')),
  tags            text[] default '{}',
  like_count      int4 not null default 0,
  comment_count   int4 not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index posts_pet_idx on posts(pet_id, created_at desc);
create index posts_place_idx on posts(place_id);
create index posts_meetup_idx on posts(meetup_id);
create index posts_created_idx on posts(created_at desc);
```

**RLS Policies**
```sql
alter table posts enable row level security;

create policy "posts_select" on posts
  for select using (is_active = true);

create policy "posts_insert" on posts
  for insert with check (
    exists (
      select 1 from pets p
      where p.id = posts.pet_id
      and p.owner_id = auth.uid()
    )
  );

create policy "posts_update" on posts
  for update using (
    exists (
      select 1 from pets p
      where p.id = posts.pet_id
      and p.owner_id = auth.uid()
    )
  );
```

---

### `post_reactions`
Paw prints, bones, hearts on posts.

```sql
create table post_reactions (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references posts(id) on delete cascade,
  pet_id          uuid not null references pets(id) on delete cascade,
  reaction_type   text not null check (reaction_type in ('PAW','BONE','HEART')),
  created_at      timestamptz not null default now(),
  unique(post_id, pet_id)
);

create index reactions_post_idx on post_reactions(post_id);
```

**Trigger: maintain like_count**
```sql
create or replace function update_post_like_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update posts set like_count = like_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update posts set like_count = like_count - 1 where id = OLD.post_id;
  end if;
  return coalesce(NEW, OLD);
end;
$$;

create trigger post_like_count
  after insert or delete on post_reactions
  for each row execute procedure update_post_like_count();
```

**RLS Policies**
```sql
alter table post_reactions enable row level security;

create policy "reactions_select" on post_reactions for select using (true);

create policy "reactions_insert" on post_reactions
  for insert with check (
    exists (
      select 1 from pets p
      where p.id = post_reactions.pet_id
      and p.owner_id = auth.uid()
    )
  );

create policy "reactions_delete" on post_reactions
  for delete using (
    exists (
      select 1 from pets p
      where p.id = post_reactions.pet_id
      and p.owner_id = auth.uid()
    )
  );
```

---

### `comments`
Threaded comments on posts.

```sql
create table comments (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references posts(id) on delete cascade,
  author_pet_id   uuid not null references pets(id) on delete cascade,
  parent_id       uuid references comments(id),   -- null = top-level
  body            text not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index comments_post_idx on comments(post_id, created_at asc);
create index comments_parent_idx on comments(parent_id);
```

**Trigger: maintain comment_count**
```sql
create or replace function update_post_comment_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update posts set comment_count = comment_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' or (TG_OP = 'UPDATE' and NEW.is_active = false) then
    update posts set comment_count = comment_count - 1 where id = coalesce(NEW.post_id, OLD.post_id);
  end if;
  return coalesce(NEW, OLD);
end;
$$;

create trigger post_comment_count
  after insert or update or delete on comments
  for each row execute procedure update_post_comment_count();
```

**RLS Policies**
```sql
alter table comments enable row level security;

create policy "comments_select" on comments
  for select using (is_active = true);

create policy "comments_insert" on comments
  for insert with check (
    exists (
      select 1 from pets p
      where p.id = comments.author_pet_id
      and p.owner_id = auth.uid()
    )
  );

create policy "comments_update" on comments
  for update using (
    exists (
      select 1 from pets p
      where p.id = comments.author_pet_id
      and p.owner_id = auth.uid()
    )
  );
```

---

### `notifications`
In-app notification log with Supabase Realtime.

```sql
create table notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid not null references profiles(id) on delete cascade,
  type            text not null,
  -- types: MEETUP_REQUEST, MEETUP_ACCEPTED, FRIEND_REQUEST, FRIEND_ACCEPTED,
  --        POST_REACTION, COMMENT, LOST_PET_NEARBY, ALERT_NEARBY
  payload         jsonb not null default '{}',
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);

create index notif_recipient_idx on notifications(recipient_id, is_read, created_at desc);
```

**RLS Policies**
```sql
alter table notifications enable row level security;

create policy "notif_select" on notifications
  for select using (auth.uid() = recipient_id);

create policy "notif_update" on notifications
  for update using (auth.uid() = recipient_id);
```

---

### `lost_pet_alerts`
Lost & found reports with geo.

```sql
create table lost_pet_alerts (
  id                  uuid primary key default gen_random_uuid(),
  pet_id              uuid not null references pets(id),
  reporter_id         uuid not null references profiles(id) on delete cascade,
  last_seen_location  geography(Point, 4326) not null,
  last_seen_at        timestamptz not null,
  description         text,
  contact_info        text not null,
  photo_url           text,
  status              text not null default 'ACTIVE'
                        check (status in ('ACTIVE','RESOLVED','EXPIRED')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index lost_pet_geo_idx on lost_pet_alerts using gist(last_seen_location);
create index lost_pet_status_idx on lost_pet_alerts(status);
```

**RLS Policies**
```sql
alter table lost_pet_alerts enable row level security;

-- All active alerts are publicly readable
create policy "lost_pet_select" on lost_pet_alerts
  for select using (status = 'ACTIVE');

create policy "lost_pet_insert" on lost_pet_alerts
  for insert with check (auth.uid() = reporter_id);

create policy "lost_pet_update" on lost_pet_alerts
  for update using (auth.uid() = reporter_id);
```

---

### `community_alerts`
Park incidents, dangerous animals, etc.

```sql
create table community_alerts (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references profiles(id) on delete cascade,
  alert_type      text not null check (alert_type in (
                    'DANGEROUS_DOG','WILDLIFE','THEFT','LOST_ITEM','OTHER'
                  )),
  location        geography(Point, 4326) not null,
  radius_km       numeric not null default 3,
  description     text not null,
  expires_at      timestamptz not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index ca_geo_idx on community_alerts using gist(location);
create index ca_active_idx on community_alerts(is_active, expires_at);
```

**RLS Policies**
```sql
alter table community_alerts enable row level security;

create policy "ca_select" on community_alerts
  for select using (is_active = true and expires_at > now());

create policy "ca_insert" on community_alerts
  for insert with check (auth.uid() = reporter_id);

create policy "ca_update" on community_alerts
  for update using (auth.uid() = reporter_id);
```

---

### `reports`
User-submitted abuse/moderation reports.

```sql
create table reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references profiles(id) on delete cascade,
  target_type     text not null check (target_type in ('profile','pet','post','comment','place')),
  target_id       uuid not null,
  reason          text not null,
  details         text,
  status          text not null default 'PENDING'
                    check (status in ('PENDING','REVIEWED','DISMISSED','ACTIONED')),
  created_at      timestamptz not null default now()
);

create index reports_status_idx on reports(status);
create index reports_reporter_idx on reports(reporter_id);
```

**RLS Policies**
```sql
alter table reports enable row level security;

-- Reporter can only see their own reports
create policy "reports_select" on reports
  for select using (auth.uid() = reporter_id);

create policy "reports_insert" on reports
  for insert with check (auth.uid() = reporter_id);
```

---

## Useful Geo Queries

```sql
-- Pets within 10km of a point
select p.*, st_distance(pr.location, st_makepoint(-122.4194, 37.7749)::geography) as dist_m
from pets p
join profiles pr on pr.id = p.owner_id
where st_dwithin(
  pr.location,
  st_makepoint(-122.4194, 37.7749)::geography,
  10000  -- 10km in metres
)
and p.is_active = true
order by dist_m asc;

-- Places within 5km
select *, st_distance(location, st_makepoint($lng, $lat)::geography) as dist_m
from places
where st_dwithin(location, st_makepoint($lng, $lat)::geography, 5000)
and is_active = true
order by dist_m asc;

-- Active lost pet alerts within 3km
select * from lost_pet_alerts
where status = 'ACTIVE'
and st_dwithin(last_seen_location, st_makepoint($lng, $lat)::geography, 3000);
```

---

## Graph Query (PostgreSQL fallback — for simple cases only)

```sql
-- Direct friends of a pet (1 hop)
select to_pet_id as friend_pet_id
from pet_relationships
where from_pet_id = $MY_PET_ID
and rel_type = 'FRIEND';

-- Friends of friends (2 hops) — use Neo4j for production
with recursive fof as (
  select to_pet_id as pet_id, 1 as depth
  from pet_relationships
  where from_pet_id = $MY_PET_ID and rel_type = 'FRIEND'
  union all
  select r.to_pet_id, fof.depth + 1
  from pet_relationships r
  join fof on r.from_pet_id = fof.pet_id
  where fof.depth < 2 and r.rel_type = 'FRIEND'
    and r.to_pet_id != $MY_PET_ID
)
select distinct pet_id from fof;
```

> ⚠️ For any traversal deeper than 2 hops or with geo filtering combined, use Neo4j (see `02_database_schema_neo4j.md`).
