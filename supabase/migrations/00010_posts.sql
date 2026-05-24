-- ============================================================
-- Migration 00010: posts & post_reactions tables
-- Feed posts from pet profiles with denormalized like_count.
-- ============================================================

-- ─── posts ────────────────────────────────────────────────
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

-- Indexes
create index posts_pet_idx on posts(pet_id, created_at desc);
create index posts_place_idx on posts(place_id);
create index posts_meetup_idx on posts(meetup_id);
create index posts_created_idx on posts(created_at desc);

-- ─── post_reactions ───────────────────────────────────────
create table post_reactions (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references posts(id) on delete cascade,
  pet_id          uuid not null references pets(id) on delete cascade,
  reaction_type   text not null check (reaction_type in ('PAW','BONE','HEART')),
  created_at      timestamptz not null default now(),
  unique(post_id, pet_id)
);

-- Indexes
create index reactions_post_idx on post_reactions(post_id);

-- ────────────────────────────────────────────────────────────
-- Trigger: maintain like_count on posts
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- RLS Policies — posts
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- RLS Policies — post_reactions
-- ────────────────────────────────────────────────────────────
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
