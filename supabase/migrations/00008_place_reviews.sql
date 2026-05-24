-- ============================================================
-- Migration 00008: place_reviews table
-- Community ratings for places. One review per user per place.
-- ============================================================

create table place_reviews (
  id              uuid primary key default gen_random_uuid(),
  place_id        uuid not null references places(id) on delete cascade,
  author_id       uuid not null references profiles(id) on delete cascade,
  rating          int2 not null check (rating between 1 and 5),
  body            text,
  created_at      timestamptz not null default now(),
  unique(place_id, author_id)
);

-- Indexes
create index pr_place_idx on place_reviews(place_id);

-- ────────────────────────────────────────────────────────────
-- Trigger: update avg_rating and review_count on places
-- ────────────────────────────────────────────────────────────
create or replace function update_place_rating()
returns trigger language plpgsql as $$
begin
  update places set
    avg_rating = (select avg(rating) from place_reviews where place_id = coalesce(NEW.place_id, OLD.place_id)),
    review_count = (select count(*) from place_reviews where place_id = coalesce(NEW.place_id, OLD.place_id)),
    updated_at = now()
  where id = coalesce(NEW.place_id, OLD.place_id);
  return coalesce(NEW, OLD);
end;
$$;

create trigger place_rating_update
  after insert or update or delete on place_reviews
  for each row execute procedure update_place_rating();

-- ────────────────────────────────────────────────────────────
-- RLS Policies
-- ────────────────────────────────────────────────────────────
alter table place_reviews enable row level security;

create policy "pr_select" on place_reviews for select using (true);

create policy "pr_insert" on place_reviews
  for insert with check (auth.uid() = author_id);

create policy "pr_update" on place_reviews
  for update using (auth.uid() = author_id);
