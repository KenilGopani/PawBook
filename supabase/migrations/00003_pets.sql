-- ============================================================
-- Migration 00003: pets table
-- Core entity. One owner can have multiple pets (max 10 enforced in Edge Function).
-- ============================================================

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
  temperament     text[] default '{}',              -- friendly, shy, high-energy, calm, dog-selective, etc.
  size            text check (size in ('small','medium','large','xlarge')),
  is_vaccinated   boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Indexes
create index pets_owner_idx on pets(owner_id);
create index pets_breed_idx on pets(breed);
create index pets_species_idx on pets(species);
create index pets_name_trgm_idx on pets using gin(name gin_trgm_ops);

-- ────────────────────────────────────────────────────────────
-- RLS Policies
-- ────────────────────────────────────────────────────────────
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
