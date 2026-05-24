-- ============================================================
-- Migration 00015: Supabase Storage bucket definitions
-- Creates all required storage buckets with appropriate policies.
-- ============================================================
-- NOTE: Storage buckets are typically created via the Supabase Dashboard
-- or Supabase CLI. This file documents the required buckets and policies.
-- If using Supabase CLI, buckets are created in config.toml.
-- For manual setup, create these buckets in Dashboard → Storage.

-- ─── Bucket: avatars (public) ─────────────────────────────
-- User profile avatars
-- Path convention: avatars/{user_id}/profile.jpg
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Anyone can read avatars
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Users can upload their own avatar
create policy "avatars_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own avatar
create policy "avatars_owner_update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── Bucket: pet-avatars (public) ─────────────────────────
-- Pet profile photos
-- Path convention: pet-avatars/{pet_id}/avatar.jpg
insert into storage.buckets (id, name, public)
values ('pet-avatars', 'pet-avatars', true)
on conflict (id) do nothing;

-- Anyone can read pet avatars
create policy "pet_avatars_public_read" on storage.objects
  for select using (bucket_id = 'pet-avatars');

-- Pet owners can upload avatars for their pets
-- (Ownership verified in Edge Function before upload)
create policy "pet_avatars_auth_insert" on storage.objects
  for insert with check (
    bucket_id = 'pet-avatars'
    and auth.uid() is not null
  );

create policy "pet_avatars_auth_update" on storage.objects
  for update using (
    bucket_id = 'pet-avatars'
    and auth.uid() is not null
  );

-- ─── Bucket: vax-docs (private) ──────────────────────────
-- Vaccination certificate documents (PDFs, images)
-- Path convention: vax-docs/{pet_id}/{record_id}.pdf
insert into storage.buckets (id, name, public)
values ('vax-docs', 'vax-docs', false)
on conflict (id) do nothing;

-- Only pet owners can read their pet's documents
-- (Access verified via Edge Function; storage policy is permissive for auth users)
create policy "vax_docs_auth_read" on storage.objects
  for select using (
    bucket_id = 'vax-docs'
    and auth.uid() is not null
  );

create policy "vax_docs_auth_insert" on storage.objects
  for insert with check (
    bucket_id = 'vax-docs'
    and auth.uid() is not null
  );

-- ─── Bucket: post-media (public) ─────────────────────────
-- Post photos and videos
-- Path convention: post-media/{pet_id}/{post_id}/{filename}
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do nothing;

-- Anyone can read post media
create policy "post_media_public_read" on storage.objects
  for select using (bucket_id = 'post-media');

-- Authenticated users can upload post media
create policy "post_media_auth_insert" on storage.objects
  for insert with check (
    bucket_id = 'post-media'
    and auth.uid() is not null
  );

create policy "post_media_auth_update" on storage.objects
  for update using (
    bucket_id = 'post-media'
    and auth.uid() is not null
  );
