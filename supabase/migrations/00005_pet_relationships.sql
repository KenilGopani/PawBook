-- ============================================================
-- Migration 00005: pet_relationships table
-- Adjacency list for the social graph. Synced to Neo4j via trigger.
-- ============================================================

create table pet_relationships (
  id              uuid primary key default gen_random_uuid(),
  from_pet_id     uuid not null references pets(id) on delete cascade,
  to_pet_id       uuid not null references pets(id) on delete cascade,
  rel_type        text not null check (rel_type in ('FRIEND_REQ','FRIEND','BLOCKED')),
  compatibility   int2 check (compatibility between 0 and 100),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(from_pet_id, to_pet_id)
);

-- Indexes
create index rel_from_idx on pet_relationships(from_pet_id);
create index rel_to_idx on pet_relationships(to_pet_id);
create index rel_type_idx on pet_relationships(rel_type);

-- ────────────────────────────────────────────────────────────
-- Trigger: sync relationship changes to Neo4j via Edge Function
-- NOTE: Requires pg_net extension and app.neo4j_sync_url setting.
-- The Edge Function URL should be set via:
--   ALTER DATABASE postgres SET app.neo4j_sync_url = 'https://...';
-- ────────────────────────────────────────────────────────────
create or replace function sync_relationship_to_neo4j()
returns trigger language plpgsql security definer as $$
begin
  perform net.http_post(
    url := current_setting('app.neo4j_sync_url'),
    body := json_build_object(
      'event', TG_OP,
      'from_pet_id', NEW.from_pet_id,
      'to_pet_id', NEW.to_pet_id,
      'rel_type', NEW.rel_type
    )::text,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  return NEW;
end;
$$;

create trigger rel_neo4j_sync
  after insert or update on pet_relationships
  for each row execute procedure sync_relationship_to_neo4j();

-- ────────────────────────────────────────────────────────────
-- RLS Policies
-- ────────────────────────────────────────────────────────────
alter table pet_relationships enable row level security;

create policy "rel_select" on pet_relationships
  for select using (
    exists (
      select 1 from pets
      where pets.id in (from_pet_id, to_pet_id)
      and pets.owner_id = auth.uid()
    )
  );

create policy "rel_insert" on pet_relationships
  for insert with check (
    exists (
      select 1 from pets
      where pets.id = from_pet_id
      and pets.owner_id = auth.uid()
    )
  );

create policy "rel_update" on pet_relationships
  for update using (
    exists (
      select 1 from pets
      where pets.id in (from_pet_id, to_pet_id)
      and pets.owner_id = auth.uid()
    )
  );
