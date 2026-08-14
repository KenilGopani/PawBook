-- ============================================================
-- Migration 00020: device_push_tokens table
-- Stores APNs device tokens so Edge Functions can push notifications
-- (lost pet alerts, community alerts) per 09_service_alerts.md
-- "Push Notification Payloads (APNs)".
-- ============================================================

create table device_push_tokens (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references profiles(id) on delete cascade,
  device_token    text not null,
  platform        text not null default 'ios' check (platform in ('ios')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(device_token)
);

-- Indexes
create index device_push_tokens_owner_idx on device_push_tokens(owner_id);

-- ────────────────────────────────────────────────────────────
-- RLS Policies — owners manage only their own device tokens.
-- Edge Functions that fan out pushes to *other* users read this table
-- with the service-role admin client, which bypasses RLS.
-- ────────────────────────────────────────────────────────────
alter table device_push_tokens enable row level security;

create policy "device_push_tokens_select" on device_push_tokens
  for select using (auth.uid() = owner_id);

create policy "device_push_tokens_insert" on device_push_tokens
  for insert with check (auth.uid() = owner_id);

create policy "device_push_tokens_update" on device_push_tokens
  for update using (auth.uid() = owner_id);

create policy "device_push_tokens_delete" on device_push_tokens
  for delete using (auth.uid() = owner_id);

-- ────────────────────────────────────────────────────────────
-- Prune stale tokens (a device that never re-registers for 90 days is
-- almost certainly a stale/reinstalled app). Registration re-upserts
-- updated_at on every app launch.
--
-- Guarded the same way as migration 00018 — pg_cron may not be
-- enabled, and that shouldn't abort the migration run.
-- ────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise warning 'Skipping prune-stale-device-tokens — pg_cron not installed.';
    return;
  end if;

  perform cron.unschedule(jobname)
  from cron.job where jobname = 'prune-stale-device-tokens';

  perform cron.schedule(
    'prune-stale-device-tokens',
    '0 3 * * *',
    $job$
      delete from device_push_tokens
      where updated_at < now() - interval '90 days';
    $job$
  );
end $$;
