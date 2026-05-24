-- ============================================================
-- Migration 00014: reports table
-- User-submitted abuse/moderation reports.
-- ============================================================

create table reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references profiles(id) on delete cascade,
  target_type     text not null check (target_type in ('profile','pet','post','comment','place')),
  target_id       uuid not null,
  reason          text not null,
  details         text,
  status          text not null default 'PENDING'
                    check (status in ('PENDING','REVIEWED','DISMISSED','ACTIONED')),
  created_at      timestamptz not null default now()
);

-- Indexes
create index reports_status_idx on reports(status);
create index reports_reporter_idx on reports(reporter_id);

-- ────────────────────────────────────────────────────────────
-- RLS Policies
-- ────────────────────────────────────────────────────────────
alter table reports enable row level security;

-- Reporter can only see their own reports
create policy "reports_select" on reports
  for select using (auth.uid() = reporter_id);

create policy "reports_insert" on reports
  for insert with check (auth.uid() = reporter_id);
