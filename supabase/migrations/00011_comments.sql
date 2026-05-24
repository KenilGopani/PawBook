-- ============================================================
-- Migration 00011: comments table
-- Threaded comments on posts with comment_count trigger.
-- ============================================================

create table comments (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references posts(id) on delete cascade,
  author_pet_id   uuid not null references pets(id) on delete cascade,
  parent_id       uuid references comments(id),   -- null = top-level comment
  body            text not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Indexes
create index comments_post_idx on comments(post_id, created_at asc);
create index comments_parent_idx on comments(parent_id);

-- ────────────────────────────────────────────────────────────
-- Trigger: maintain comment_count on posts
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- RLS Policies
-- ────────────────────────────────────────────────────────────
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
