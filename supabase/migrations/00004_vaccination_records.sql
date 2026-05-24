-- ============================================================
-- Migration 00004: vaccination_records table
-- Vet documents uploaded to Supabase Storage.
-- ============================================================

create table vaccination_records (
  id              uuid primary key default gen_random_uuid(),
  pet_id          uuid not null references pets(id) on delete cascade,
  vaccine_name    text not null,
  administered_on date not null,
  expires_on      date,
  doc_url         text,                             -- Supabase Storage path
  verified        boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Indexes
create index vacc_pet_idx on vaccination_records(pet_id);

-- ────────────────────────────────────────────────────────────
-- RLS Policies
-- ────────────────────────────────────────────────────────────
alter table vaccination_records enable row level security;

-- Owner can read their pet's records; others can see only verified ones
create policy "vacc_select_own" on vaccination_records
  for select using (
    exists (
      select 1 from pets
      where pets.id = vaccination_records.pet_id
      and pets.owner_id = auth.uid()
    )
    or verified = true
  );

create policy "vacc_insert" on vaccination_records
  for insert with check (
    exists (
      select 1 from pets
      where pets.id = vaccination_records.pet_id
      and pets.owner_id = auth.uid()
    )
  );
