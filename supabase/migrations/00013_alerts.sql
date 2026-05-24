-- ============================================================
-- Migration 00013: lost_pet_alerts & community_alerts tables
-- Safety features with geo-based alerting.
-- ============================================================

-- ─── lost_pet_alerts ──────────────────────────────────────
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

-- Indexes
create index lost_pet_geo_idx on lost_pet_alerts using gist(last_seen_location);
create index lost_pet_status_idx on lost_pet_alerts(status);

-- RLS
alter table lost_pet_alerts enable row level security;

-- All active alerts are publicly readable
create policy "lost_pet_select" on lost_pet_alerts
  for select using (status = 'ACTIVE');

create policy "lost_pet_insert" on lost_pet_alerts
  for insert with check (auth.uid() = reporter_id);

create policy "lost_pet_update" on lost_pet_alerts
  for update using (auth.uid() = reporter_id);

-- ─── community_alerts ─────────────────────────────────────
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

-- Indexes
create index ca_geo_idx on community_alerts using gist(location);
create index ca_active_idx on community_alerts(is_active, expires_at);

-- RLS
alter table community_alerts enable row level security;

create policy "ca_select" on community_alerts
  for select using (is_active = true and expires_at > now());

create policy "ca_insert" on community_alerts
  for insert with check (auth.uid() = reporter_id);

create policy "ca_update" on community_alerts
  for update using (auth.uid() = reporter_id);
