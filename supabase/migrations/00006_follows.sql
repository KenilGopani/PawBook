-- ============================================================
-- Migration 00006: follows table
-- Owner-to-owner follow for feed purposes.
-- ============================================================

create table follows (
  follower_id     uuid not null references profiles(id) on delete cascade,
  following_id    uuid not null references profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id != following_id)
);

-- Indexes
create index follows_following_idx on follows(following_id);

-- ────────────────────────────────────────────────────────────
-- RLS Policies
-- ────────────────────────────────────────────────────────────
alter table follows enable row level security;

create policy "follows_select" on follows for select using (true);

create policy "follows_insert" on follows
  for insert with check (auth.uid() = follower_id);

create policy "follows_delete" on follows
  for delete using (auth.uid() = follower_id);
