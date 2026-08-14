-- ============================================================
-- Migration 00021: idempotency_keys table
--
-- Implements the "Idempotency" convention from 11_api_conventions.md:
-- clients may send an `Idempotency-Key` header on post/meetup/friend-
-- request/alert creation; the server stores the result for 24h and
-- replays it on a duplicate call instead of re-running the mutation.
-- ============================================================

create table idempotency_keys (
  key             text not null,
  user_id         uuid not null references profiles(id) on delete cascade,
  endpoint        text not null,
  status_code     int2 not null,
  response_body   jsonb,
  created_at      timestamptz not null default now(),
  primary key (user_id, endpoint, key)
);

-- ────────────────────────────────────────────────────────────
-- RLS Policies — a user can only read/write their own idempotency
-- records (matches every other table's "RLS at the DB layer" rule).
-- ────────────────────────────────────────────────────────────
alter table idempotency_keys enable row level security;

create policy "idempotency_keys_select" on idempotency_keys
  for select using (auth.uid() = user_id);

create policy "idempotency_keys_insert" on idempotency_keys
  for insert with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- Prune entries past their 24h replay window.
-- Guarded like migration 00018 — pg_cron may not be enabled.
-- ────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise warning 'Skipping prune-idempotency-keys — pg_cron not installed.';
    return;
  end if;

  perform cron.unschedule(jobname)
  from cron.job where jobname = 'prune-idempotency-keys';

  perform cron.schedule(
    'prune-idempotency-keys',
    '*/30 * * * *',
    $job$
      delete from idempotency_keys
      where created_at < now() - interval '24 hours';
    $job$
  );
end $$;
