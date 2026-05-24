-- ============================================================
-- Migration 00018: pg_cron scheduled jobs
-- Requires pg_cron extension (enabled via Supabase Dashboard).
-- See: 07_service_meetup.md, 09_service_alerts.md, 10_sync_supabase_neo4j.md
-- ============================================================

-- NOTE: pg_cron and pg_net must be enabled in the Supabase Dashboard
-- before running these. The app.edge_function_url and app.service_role_key
-- must be set via: ALTER DATABASE postgres SET app.edge_function_url = '...';

-- ─── Auto-complete meetups ───────────────────────────────
-- Every 15 minutes: complete SCHEDULED meetups whose time has passed + 2h
select cron.schedule(
  'auto-complete-meetups',
  '*/15 * * * *',
  $$
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
  $$
);

-- ─── Auto-expire community alerts ────────────────────────
-- Every 15 minutes: deactivate expired community alerts
select cron.schedule(
  'expire-community-alerts',
  '*/15 * * * *',
  $$
    update community_alerts
    set is_active = false
    where is_active = true
      and expires_at < now();
  $$
);

-- ─── Neo4j health check ─────────────────────────────────
-- Every 5 minutes: ping Neo4j via edge function
select cron.schedule(
  'neo4j-health-check',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := current_setting('app.edge_function_url') || '/neo4j-health',
      body := '{}'::text,
      headers := json_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      )::jsonb
    );
  $$
);
