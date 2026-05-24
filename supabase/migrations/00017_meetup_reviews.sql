-- ============================================================
-- Migration 00017: Meetup Reviews table
-- Post-meetup reviews with rating and compatibility scoring.
-- See: 07_service_meetup.md — Review Endpoints
-- ============================================================

create table if not exists meetup_reviews (
  id            uuid primary key default uuid_generate_v4(),
  meetup_id     uuid not null references meetups(id) on delete cascade,
  reviewer_pet_id uuid not null references pets(id) on delete cascade,
  reviewed_pet_id uuid not null references pets(id) on delete cascade,
  rating        smallint not null check (rating >= 1 and rating <= 5),
  notes         text check (char_length(notes) <= 300),
  created_at    timestamptz not null default now(),

  -- One review per reviewer → reviewed pair per meetup
  unique (meetup_id, reviewer_pet_id, reviewed_pet_id),

  -- Cannot review yourself
  check (reviewer_pet_id <> reviewed_pet_id)
);

-- Indexes
create index idx_meetup_reviews_meetup on meetup_reviews(meetup_id);
create index idx_meetup_reviews_reviewed on meetup_reviews(reviewed_pet_id);
create index idx_meetup_reviews_reviewer on meetup_reviews(reviewer_pet_id);

-- ─── RLS ─────────────────────────────────────────────────
alter table meetup_reviews enable row level security;

-- Anyone authenticated can read reviews
create policy "reviews_read" on meetup_reviews
  for select using (true);

-- Only the reviewer's pet owner can insert
create policy "reviews_insert" on meetup_reviews
  for insert with check (
    exists (
      select 1 from pets
      where pets.id = reviewer_pet_id
        and pets.owner_id = auth.uid()
    )
  );

-- No updates or deletes — reviews are permanent
