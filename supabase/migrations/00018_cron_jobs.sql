-- ============================================================
-- Migration 00018: pg_cron scheduled jobs
-- See: 07_service_meetup.md, 09_service_alerts.md, 10_sync_supabase_neo4j.md
--
-- pg_cron is not enabled by default on a fresh database. Rather than
-- hard-failing the whole migration run (which would abort `supabase
-- db reset` before the seed ever executes), this tries to enable the
-- extension and skips scheduling with a warning if it can't. The jobs
-- are an operational nicety — complete-meetup and the alert expiry can
-- both be triggered by hand — so they're not worth blocking setup over.
--
-- Also requires, for the jobs that call Edge Functions:
--   ALTER DATABASE postgres SET app.edge_function_url = '...';
--   ALTER DATABASE postgres SET app.service_role_key  = '...';
-- ============================================================

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise warning 'pg_cron unavailable (%). Scheduled jobs will be skipped.', sqlerrm;
end $$;

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise warning 'Skipping pg_cron job setup — extension not installed.';
    return;
  end if;

  -- Re-running the migration shouldn't collide with existing jobs.
  perform cron.unschedule(jobname)
  from cron.job
  where jobname in (
    'auto-complete-meetups', 'expire-community-alerts', 'neo4j-health-check'
  );

  -- ─── Auto-complete meetups ─────────────────────────────
  -- Every 15 minutes: complete SCHEDULED meetups that ended >2h ago.
  perform cron.schedule(
    'auto-complete-meetups',
    '*/15 * * * *',
    $job$
      select net.http_post(
        url := current_setting('app.edge_function_url') || '/complete-meetup',
        body := json_build_object('meetup_id', id)::text,
        headers := json_build_object(
          'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
          'Content-Type', 'application/json'
        )::jsonb
      )
      from meetups
      where status = 'SCHEDULED'
        and scheduled_at < now() - interval '2 hours';
    $job$
  );

  -- ─── Auto-expire community alerts ──────────────────────
  perform cron.schedule(
    'expire-community-alerts',
    '*/15 * * * *',
    $job$
      update community_alerts
      set is_active = false
      where is_active = true
        and expires_at < now();
    $job$
  );

  -- ─── Neo4j health check ────────────────────────────────
  perform cron.schedule(
    'neo4j-health-check',
    '*/5 * * * *',
    $job$
      select net.http_post(
        url := current_setting('app.edge_function_url') || '/neo4j-health',
        headers := json_build_object(
          'Authorization', 'Bearer ' || current_setting('app.service_role_key')
        )::jsonb
      );
    $job$
  );
end $$;
