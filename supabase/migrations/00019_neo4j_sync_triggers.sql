-- ============================================================
-- Migration 00019: Neo4j sync trigger wiring
--
-- Spec 10 (10_sync_supabase_neo4j.md) defines a "Sync Event Table" of DB
-- triggers that call the sync-* Edge Functions as a safety net for writes
-- that bypass the main Edge Functions (e.g. direct SDK updates). Those
-- Edge Functions already existed (sync-owner-create, sync-owner-update,
-- sync-pet-update, sync-place-update, sync-relationship-delete) but no
-- trigger actually called them except a broken one on pet_relationships
-- that fired on insert/update instead of delete, and sent a payload shape
-- the target function didn't understand.
--
-- This migration:
--   1. Adds a shared helper that POSTs a Supabase-webhook-shaped payload
--      ({ type, table, schema, record, old_record }) to an Edge Function,
--      matching what sync-owner-create/update, sync-pet-update,
--      sync-place-update and sync-relationship-delete already expect.
--   2. Wires the missing triggers: profiles INSERT/UPDATE, pets UPDATE,
--      places UPDATE.
--   3. Replaces the pet_relationships insert/update trigger (dead weight —
--      those events are already synced inline by send-friend-request /
--      accept-friend-request / block-pet) with a DELETE trigger, per spec.
--
-- Requires (same as migration 00018):
--   - pg_net extension enabled (Supabase Dashboard → Database → Extensions)
--   - ALTER DATABASE postgres SET app.edge_function_url = 'https://<project-ref>.supabase.co/functions/v1';
--   - ALTER DATABASE postgres SET app.service_role_key = '<service-role-key>';
-- If those settings are not configured (e.g. fresh local dev), sync calls
-- are skipped with a warning rather than failing the underlying write —
-- Neo4j sync is eventually-consistent and non-blocking by design (see
-- README "Key Design Decisions").
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Shared helper: POST a webhook-shaped payload to a sync Edge Function.
-- Never raises — a Neo4j outage must not roll back a Supabase write.
-- ────────────────────────────────────────────────────────────
create or replace function public.call_neo4j_sync_function(
  endpoint_path text,
  payload jsonb
) returns void
language plpgsql
security definer
as $$
declare
  base_url text;
  service_key text;
begin
  begin
    base_url := current_setting('app.edge_function_url');
    service_key := current_setting('app.service_role_key');
  exception when others then
    raise warning 'Neo4j sync skipped for %: app.edge_function_url / app.service_role_key not configured', endpoint_path;
    return;
  end;

  begin
    perform net.http_post(
      url := base_url || endpoint_path,
      body := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      )
    );
  exception when others then
    raise warning 'Neo4j sync http_post to % failed: %', endpoint_path, sqlerrm;
  end;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- profiles: INSERT → sync-owner-create, UPDATE (name/city/location) → sync-owner-update
-- ────────────────────────────────────────────────────────────
create or replace function public.trg_sync_owner_create()
returns trigger language plpgsql security definer as $$
begin
  perform public.call_neo4j_sync_function(
    '/sync-owner-create',
    jsonb_build_object(
      'type', 'INSERT',
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', null
    )
  );
  return NEW;
end;
$$;

drop trigger if exists profiles_sync_owner_create on public.profiles;
create trigger profiles_sync_owner_create
  after insert on public.profiles
  for each row execute function public.trg_sync_owner_create();

create or replace function public.trg_sync_owner_update()
returns trigger language plpgsql security definer as $$
begin
  perform public.call_neo4j_sync_function(
    '/sync-owner-update',
    jsonb_build_object(
      'type', 'UPDATE',
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', to_jsonb(OLD)
    )
  );
  return NEW;
end;
$$;

drop trigger if exists profiles_sync_owner_update on public.profiles;
create trigger profiles_sync_owner_update
  after update on public.profiles
  for each row
  when (
    OLD.display_name is distinct from NEW.display_name
    or OLD.city is distinct from NEW.city
    or OLD.location is distinct from NEW.location
  )
  execute function public.trg_sync_owner_update();

-- ────────────────────────────────────────────────────────────
-- pets: UPDATE (incl. soft-delete via is_active) → sync-pet-update
-- ────────────────────────────────────────────────────────────
create or replace function public.trg_sync_pet_update()
returns trigger language plpgsql security definer as $$
begin
  perform public.call_neo4j_sync_function(
    '/sync-pet-update',
    jsonb_build_object(
      'type', 'UPDATE',
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', to_jsonb(OLD)
    )
  );
  return NEW;
end;
$$;

drop trigger if exists pets_sync_update on public.pets;
create trigger pets_sync_update
  after update on public.pets
  for each row
  when (OLD is distinct from NEW)
  execute function public.trg_sync_pet_update();

-- ────────────────────────────────────────────────────────────
-- places: UPDATE → sync-place-update
-- ────────────────────────────────────────────────────────────
create or replace function public.trg_sync_place_update()
returns trigger language plpgsql security definer as $$
begin
  perform public.call_neo4j_sync_function(
    '/sync-place-update',
    jsonb_build_object(
      'type', 'UPDATE',
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', to_jsonb(OLD)
    )
  );
  return NEW;
end;
$$;

drop trigger if exists places_sync_update on public.places;
create trigger places_sync_update
  after update on public.places
  for each row
  when (OLD is distinct from NEW)
  execute function public.trg_sync_place_update();

-- ────────────────────────────────────────────────────────────
-- pet_relationships: replace the broken insert/update trigger from
-- migration 00005 with a DELETE trigger → sync-relationship-delete.
-- INSERT/UPDATE (FRIEND_REQ, FRIEND, BLOCKED) are already synced inline
-- by send-friend-request / accept-friend-request / block-pet — see the
-- Sync Event Table in 10_sync_supabase_neo4j.md.
-- ────────────────────────────────────────────────────────────
drop trigger if exists rel_neo4j_sync on public.pet_relationships;
drop function if exists public.sync_relationship_to_neo4j();

create or replace function public.trg_sync_relationship_delete()
returns trigger language plpgsql security definer as $$
begin
  perform public.call_neo4j_sync_function(
    '/sync-relationship-delete',
    jsonb_build_object(
      'type', 'DELETE',
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', null,
      'old_record', to_jsonb(OLD)
    )
  );
  return OLD;
end;
$$;

drop trigger if exists pet_relationships_sync_delete on public.pet_relationships;
create trigger pet_relationships_sync_delete
  after delete on public.pet_relationships
  for each row execute function public.trg_sync_relationship_delete();
