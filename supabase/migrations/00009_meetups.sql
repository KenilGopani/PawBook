-- ============================================================
-- Migration 00009: meetups & meetup_participants tables
-- Core meetup entity with RSVP lifecycle.
-- ============================================================

-- ─── meetups ───────────────────────────────────────────────
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

-- Indexes
create index meetups_organizer_idx on meetups(organizer_id);
create index meetups_place_idx on meetups(place_id);
create index meetups_status_idx on meetups(status);
create index meetups_scheduled_idx on meetups(scheduled_at);

-- ─── meetup_participants ──────────────────────────────────
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

-- Indexes
create index mp_meetup_idx on meetup_participants(meetup_id);
create index mp_pet_idx on meetup_participants(pet_id);

-- ────────────────────────────────────────────────────────────
-- RLS Policies — meetups
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- RLS Policies — meetup_participants
-- ────────────────────────────────────────────────────────────
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
