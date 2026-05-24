-- ============================================================
-- Migration 00007: places table
-- Dog parks, pet cafes, trails, beaches, vets, groomers.
-- ============================================================

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

-- Indexes
create index places_location_idx on places using gist(location);
create index places_type_idx on places(type);
create index places_name_trgm_idx on places using gin(name gin_trgm_ops);

-- ────────────────────────────────────────────────────────────
-- RLS Policies
-- ────────────────────────────────────────────────────────────
alter table places enable row level security;

create policy "places_select" on places
  for select using (is_active = true);

create policy "places_insert" on places
  for insert with check (auth.uid() is not null);

create policy "places_update" on places
  for update using (auth.uid() = added_by);
