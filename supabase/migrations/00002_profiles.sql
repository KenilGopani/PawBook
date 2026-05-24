-- ============================================================
-- Migration 00002: profiles table
-- Extends Supabase auth.users. Auto-created on signup via trigger.
-- ============================================================

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

-- Indexes
create index profiles_location_idx on profiles using gist(location);
create index profiles_city_idx on profiles(city);

-- ────────────────────────────────────────────────────────────
-- Trigger: auto-create profile row when a new auth user signs up
-- ────────────────────────────────────────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Pet Owner')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ────────────────────────────────────────────────────────────
-- RLS Policies
-- ────────────────────────────────────────────────────────────
alter table profiles enable row level security;

-- Anyone can read any active profile
create policy "profiles_select" on profiles
  for select using (is_active = true);

-- Only owner can update their own profile
create policy "profiles_update" on profiles
  for update using (auth.uid() = id);
