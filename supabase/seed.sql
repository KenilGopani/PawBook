-- ============================================================
-- PawBook — local development seed
--
-- Runs automatically after migrations on `supabase db reset`.
-- Deliberately NOT a numbered migration: migrations are applied to
-- every environment by `supabase db push`, and demo pets have no
-- business in staging or production.
--
-- Gives you six real logins, seven pets with a friendship graph
-- between them, four places, three meetups spanning the lifecycle,
-- a feed with reactions and comments, and live safety alerts.
--
--   Log in as:  demo@pawbook.test
--   Password:   pawbook123
--   (every seeded account uses the same password)
--
-- Re-running is safe — it clears its own rows first.
--
-- NOTE: this does NOT populate Neo4j. The graph is written by the
-- Edge Functions and the sync triggers from migration 00019, so
-- graph-backed screens (discover-*, mutual-friends, social proof)
-- stay empty until those run. Seeding the graph means running
-- neo4j/setup_constraints.cypher and letting the app write to it.
-- ============================================================

-- crypt()/gen_salt() live in the extensions schema on Supabase.
create extension if not exists pgcrypto;
set search_path = public, extensions;

-- ── Stable IDs ──────────────────────────────────────────────
-- Fixed UUIDs keep the seed re-runnable and greppable. The group
-- nibble encodes the entity type: a=user, b=pet, c=place,
-- d=meetup, e=post, f=alert.

-- ── 1. Clear previously seeded rows ─────────────────────────
-- Order matters: several FKs here are RESTRICT, not CASCADE
-- (places.added_by, posts.place_id, lost_pet_alerts.pet_id), so
-- children go before the parents that would otherwise block.

delete from meetup_reviews      where meetup_id::text like '00000000-0000-4000-d000-%';
delete from meetup_participants where meetup_id::text like '00000000-0000-4000-d000-%';
delete from meetups             where id::text        like '00000000-0000-4000-d000-%';
delete from lost_pet_alerts     where id::text        like '00000000-0000-4000-f000-%';
delete from community_alerts    where id::text        like '00000000-0000-4000-f000-%';
delete from posts               where id::text        like '00000000-0000-4000-e000-%';
delete from place_reviews       where place_id::text  like '00000000-0000-4000-c000-%';

-- Cascades through profiles → pets → relationships, comments,
-- reactions, vaccination records and notifications.
delete from auth.users where email like '%@pawbook.test';

delete from places where id::text like '00000000-0000-4000-c000-%';

-- ── 2. Auth users ───────────────────────────────────────────
-- Inserting here fires handle_new_user() (migration 00002), which
-- creates the matching profiles row from raw_user_meta_data.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id, 'authenticated', 'authenticated', u.email,
  crypt('pawbook123', gen_salt('bf')),
  now(), now() - interval '90 days', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name),
  false, '', '', '', ''
from (values
  ('00000000-0000-4000-a000-000000000001'::uuid, 'demo@pawbook.test',  'Kenil G.'),
  ('00000000-0000-4000-a000-000000000002'::uuid, 'aisha@pawbook.test', 'Aisha R.'),
  ('00000000-0000-4000-a000-000000000003'::uuid, 'marco@pawbook.test', 'Marco P.'),
  ('00000000-0000-4000-a000-000000000004'::uuid, 'dana@pawbook.test',  'Dana K.'),
  ('00000000-0000-4000-a000-000000000005'::uuid, 'sam@pawbook.test',   'Sam T.'),
  ('00000000-0000-4000-a000-000000000006'::uuid, 'priya@pawbook.test', 'Priya N.')
) as u(id, email, full_name);

-- GoTrue needs a matching identity row or email sign-in fails.
-- provider_id was added in a later GoTrue; branch on it so this
-- seed keeps working across CLI versions.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'identities'
      and column_name = 'provider_id'
  ) then
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    select gen_random_uuid(), u.id, u.id::text,
           jsonb_build_object('sub', u.id::text, 'email', u.email),
           'email', now(), now(), now()
    from auth.users u
    where u.email like '%@pawbook.test';
  else
    insert into auth.identities (
      id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    select gen_random_uuid(), u.id,
           jsonb_build_object('sub', u.id::text, 'email', u.email),
           'email', now(), now(), now()
    from auth.users u
    where u.email like '%@pawbook.test';
  end if;
end $$;

-- ── 3. Profiles ─────────────────────────────────────────────
-- The rows already exist (trigger). Fill in the rest.
-- Locations are real San Francisco points so the PostGIS radius
-- queries in places-nearby / users_within_radius return results.

update profiles set
  bio      = 'Weekend park regular. Two dogs, zero chill.',
  city     = 'San Francisco',
  location = st_setsrid(st_makepoint(-122.4330, 37.7750), 4326)::geography
where id = '00000000-0000-4000-a000-000000000001';

update profiles set
  bio      = 'Border collie owner, so mostly I just throw things.',
  city     = 'San Francisco',
  location = st_setsrid(st_makepoint(-122.4351, 37.7761), 4326)::geography
where id = '00000000-0000-4000-a000-000000000002';

update profiles set
  bio      = 'Cat person in a dog app. Here for the parks.',
  city     = 'San Francisco',
  location = st_setsrid(st_makepoint(-122.4214, 37.7599), 4326)::geography
where id = '00000000-0000-4000-a000-000000000003';

update profiles set
  bio      = 'Beach every Sunday, rain or shine.',
  city     = 'San Francisco',
  location = st_setsrid(st_makepoint(-122.4836, 37.7936), 4326)::geography
where id = '00000000-0000-4000-a000-000000000004';

update profiles set
  bio      = 'Corgi dad. Yes he is short. Yes he knows.',
  city     = 'Oakland',
  location = st_setsrid(st_makepoint(-122.2712, 37.8044), 4326)::geography
where id = '00000000-0000-4000-a000-000000000005';

update profiles set
  bio      = 'Rabbit rescue volunteer.',
  city     = 'Berkeley',
  location = st_setsrid(st_makepoint(-122.2730, 37.8715), 4326)::geography
where id = '00000000-0000-4000-a000-000000000006';

-- ── 4. Pets ─────────────────────────────────────────────────
-- The demo account owns the first two, so there's something to
-- switch between in the "posting as" picker.

insert into pets (
  id, owner_id, name, species, breed, dob, gender, bio,
  temperament, size, is_vaccinated, created_at
) values
  ('00000000-0000-4000-b000-000000000001',
   '00000000-0000-4000-a000-000000000001',
   'Mochi', 'dog', 'Shiba Inu', '2022-04-11', 'female',
   'Professional zoomie athlete. Will trade sit for cheese.',
   array['high-energy','playful','friendly'], 'medium', true,
   now() - interval '88 days'),

  ('00000000-0000-4000-b000-000000000002',
   '00000000-0000-4000-a000-000000000001',
   'Biscuit', 'dog', 'Golden Retriever', '2020-09-02', 'male',
   'Loves everyone. Has never had a single thought.',
   array['friendly','calm','good-with-kids'], 'large', true,
   now() - interval '88 days'),

  ('00000000-0000-4000-b000-000000000003',
   '00000000-0000-4000-a000-000000000002',
   'Pepper', 'dog', 'Border Collie', '2021-06-20', 'female',
   'Herds children. Unpaid.',
   array['high-energy','protective','playful'], 'medium', true,
   now() - interval '80 days'),

  ('00000000-0000-4000-b000-000000000004',
   '00000000-0000-4000-a000-000000000003',
   'Tofu', 'cat', 'British Shorthair', '2023-01-15', 'male',
   'Tolerates dogs. Barely.',
   array['independent','calm'], 'small', true,
   now() - interval '70 days'),

  ('00000000-0000-4000-b000-000000000005',
   '00000000-0000-4000-a000-000000000004',
   'Nala', 'dog', 'Labrador', '2019-11-30', 'female',
   'Swims in anything. Including puddles.',
   array['friendly','high-energy','good-with-kids'], 'large', true,
   now() - interval '65 days'),

  ('00000000-0000-4000-b000-000000000006',
   '00000000-0000-4000-a000-000000000005',
   'Waffles', 'dog', 'Corgi', '2022-08-08', 'male',
   'Short king. Long body.',
   array['playful','friendly','dog-selective'], 'small', false,
   now() - interval '50 days'),

  ('00000000-0000-4000-b000-000000000007',
   '00000000-0000-4000-a000-000000000006',
   'Sesame', 'rabbit', 'Holland Lop', '2023-05-05', 'female',
   'Silent. Judging.',
   array['shy','calm'], 'small', true,
   now() - interval '40 days');

-- ── 5. Vaccination records ──────────────────────────────────
insert into vaccination_records
  (pet_id, vaccine_name, administered_on, expires_on, verified)
values
  ('00000000-0000-4000-b000-000000000001', 'Rabies',      '2025-03-14', '2028-03-14', true),
  ('00000000-0000-4000-b000-000000000001', 'DHPP',        '2025-03-14', '2026-03-14', true),
  ('00000000-0000-4000-b000-000000000002', 'Rabies',      '2024-11-02', '2027-11-02', true),
  ('00000000-0000-4000-b000-000000000002', 'Bordetella',  '2025-06-20', '2026-06-20', false),
  ('00000000-0000-4000-b000-000000000003', 'Rabies',      '2025-01-30', '2028-01-30', true),
  ('00000000-0000-4000-b000-000000000005', 'Rabies',      '2024-09-12', '2027-09-12', true);

-- ── 6. Social graph ─────────────────────────────────────────
-- Two settled friendships plus one pending request, so the demo
-- account lands on Discover with something waiting in the inbox.
--
-- ONE row per friendship, not two. That's what the app actually
-- produces: send-friend-request inserts a single FRIEND_REQ row and
-- accept-friend-request UPDATEs that same row to FRIEND. Storing
-- both directions would also break send-friend-request, whose
-- "do these two already have a relationship?" check is an
-- .or(...).maybeSingle() — which errors when two rows match.
--
-- Direction is chosen so the demo account's pets are always
-- from_pet_id, because the friends list in 05_service_social_graph.md
-- filters on from_pet_id alone. (That directionality is a real gap in
-- the backend — B does not see A as a friend — but it's the existing
-- behaviour, and the seed shouldn't paper over it.)
--
-- INSERTs here don't fire the Neo4j sync trigger: migration 00019
-- deliberately narrowed that to DELETE, since creates are synced
-- inline by send-/accept-friend-request.

insert into pet_relationships
  (from_pet_id, to_pet_id, rel_type, compatibility, created_at)
values
  -- Mochi → Pepper
  ('00000000-0000-4000-b000-000000000001',
   '00000000-0000-4000-b000-000000000003', 'FRIEND', 88, now() - interval '60 days'),

  -- Biscuit → Waffles
  ('00000000-0000-4000-b000-000000000002',
   '00000000-0000-4000-b000-000000000006', 'FRIEND', 63, now() - interval '24 days'),

  -- Pepper → Nala: a friendship the demo user is *not* part of, which
  -- is what makes friend-of-friend discovery non-trivial.
  ('00000000-0000-4000-b000-000000000003',
   '00000000-0000-4000-b000-000000000005', 'FRIEND', 79, now() - interval '30 days'),

  -- Nala → Mochi, still pending: shows up in the requests queue
  ('00000000-0000-4000-b000-000000000005',
   '00000000-0000-4000-b000-000000000001', 'FRIEND_REQ', null, now() - interval '2 days');

-- Owner-level follows
insert into follows (follower_id, following_id) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000004'),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000001');

-- ── 7. Places ───────────────────────────────────────────────
-- avg_rating / review_count are left at defaults on purpose — the
-- trigger in migration 00008 recomputes them when reviews land.

insert into places
  (id, name, type, location, address, tags, added_by, is_verified)
values
  ('00000000-0000-4000-c000-000000000001', 'Alamo Square Dog Run', 'park',
   st_setsrid(st_makepoint(-122.4350, 37.7763), 4326)::geography,
   'Steiner St & Hayes St',
   array['off-leash','fenced','water','shade'],
   '00000000-0000-4000-a000-000000000002', true),

  ('00000000-0000-4000-c000-000000000002', 'Barkley''s Pet Café', 'cafe',
   st_setsrid(st_makepoint(-122.4214, 37.7599), 4326)::geography,
   '1042 Valencia St',
   array['indoor','outdoor-seating','dog-menu','pet-friendly-staff'],
   '00000000-0000-4000-a000-000000000003', true),

  ('00000000-0000-4000-c000-000000000003', 'Fort Funston Trail', 'trail',
   st_setsrid(st_makepoint(-122.5033, 37.7150), 4326)::geography,
   'Fort Funston Rd',
   array['off-leash','water','parking'],
   '00000000-0000-4000-a000-000000000004', true),

  ('00000000-0000-4000-c000-000000000004', 'Baker Beach', 'beach',
   st_setsrid(st_makepoint(-122.4836, 37.7936), 4326)::geography,
   'Gibson Rd',
   array['off-leash','water','parking'],
   '00000000-0000-4000-a000-000000000001', false);

insert into place_reviews (place_id, author_id, rating, body, created_at) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001',
   5, 'Fencing is solid and the water fountain actually works. Our default.',
   now() - interval '20 days'),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000002',
   4, 'Great in the morning, gets crowded after 5pm.', now() - interval '12 days'),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000004',
   5, 'Best shade in the city on a hot day.', now() - interval '6 days'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000003',
   4, 'Staff genuinely like the dogs. Puppuccino is free.', now() - interval '15 days'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000005',
   4, 'Small indoor space — better for calm dogs.', now() - interval '9 days'),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000004',
   5, 'Nothing beats it at golden hour. Bring a towel.', now() - interval '30 days'),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000001',
   5, 'Long walk from the lot but worth every step.', now() - interval '4 days'),
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000004',
   4, 'Off-leash at the north end. Watch the current.', now() - interval '11 days');

-- ── 8. Meetups ──────────────────────────────────────────────
-- One of each interesting state so the lifecycle rail in the UI
-- has something to show: upcoming, awaiting RSVPs, and done.

insert into meetups
  (id, organizer_id, place_id, title, description, status,
   scheduled_at, max_pets, is_group, created_at)
values
  ('00000000-0000-4000-d000-000000000001',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-c000-000000000001',
   'Saturday morning zoomies', 'Usual crew, usual chaos. Coffee after.',
   'SCHEDULED', now() + interval '2 days', 8, true, now() - interval '4 days'),

  ('00000000-0000-4000-d000-000000000002',
   '00000000-0000-4000-a000-000000000004',
   '00000000-0000-4000-c000-000000000003',
   'Beach day with Nala', 'Low tide, bring towels.',
   'PENDING', now() + interval '5 days', 4, false, now() - interval '1 day'),

  ('00000000-0000-4000-d000-000000000003',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-c000-000000000002',
   'Café hang', 'Indoor, calm dogs only.',
   'COMPLETED', now() - interval '6 days', 4, false, now() - interval '13 days');

insert into meetup_participants
  (meetup_id, pet_id, rsvp_status, invited_by)
values
  -- Saturday zoomies
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001',
   'ACCEPTED', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000003',
   'ACCEPTED', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000005',
   'INVITED',  '00000000-0000-4000-a000-000000000001'),

  -- Beach day — Biscuit is INVITED, so the demo account has an
  -- RSVP decision waiting for it
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000005',
   'ACCEPTED', '00000000-0000-4000-a000-000000000004'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000002',
   'INVITED',  '00000000-0000-4000-a000-000000000004'),

  -- Café hang (done)
  ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-b000-000000000002',
   'ACCEPTED', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-b000-000000000006',
   'ACCEPTED', '00000000-0000-4000-a000-000000000001');

insert into meetup_reviews
  (meetup_id, reviewer_pet_id, reviewed_pet_id, rating, notes, created_at)
values
  ('00000000-0000-4000-d000-000000000003',
   '00000000-0000-4000-b000-000000000002',
   '00000000-0000-4000-b000-000000000006',
   5, 'Waffles was impeccably behaved indoors. Would meet again.',
   now() - interval '5 days'),
  ('00000000-0000-4000-d000-000000000003',
   '00000000-0000-4000-b000-000000000006',
   '00000000-0000-4000-b000-000000000002',
   5, 'Biscuit shared his water bowl unprompted. A gentleman.',
   now() - interval '5 days');

-- ── 9. Feed ─────────────────────────────────────────────────
-- like_count / comment_count are left at 0 — the triggers in
-- migrations 00010 and 00011 derive them from the rows below.

insert into posts
  (id, pet_id, place_id, caption, media_type, tags, created_at)
values
  ('00000000-0000-4000-e000-000000000001',
   '00000000-0000-4000-b000-000000000003',
   '00000000-0000-4000-c000-000000000001',
   'Held the ball for 45 minutes. Did not drop it once. Legend behaviour.',
   'text', array['park','goodboy'], now() - interval '42 minutes'),

  ('00000000-0000-4000-e000-000000000002',
   '00000000-0000-4000-b000-000000000005',
   '00000000-0000-4000-c000-000000000003',
   'Fort Funston at golden hour. She swam. I did laundry after.',
   'text', array['beach','zoomies'], now() - interval '3 hours'),

  ('00000000-0000-4000-e000-000000000003',
   '00000000-0000-4000-b000-000000000001',
   null,
   'Mochi discovered the vacuum has an off switch. We are no longer safe.',
   'text', array[]::text[], now() - interval '26 hours'),

  ('00000000-0000-4000-e000-000000000004',
   '00000000-0000-4000-b000-000000000006',
   '00000000-0000-4000-c000-000000000002',
   'Ordered the puppuccino. Reviewed it. Four stars, would foam again.',
   'text', array['cafe'], now() - interval '2 days'),

  ('00000000-0000-4000-e000-000000000005',
   '00000000-0000-4000-b000-000000000002',
   '00000000-0000-4000-c000-000000000001',
   'Biscuit made three new friends and forgot all of them immediately.',
   'text', array['park'], now() - interval '4 days');

insert into post_reactions (post_id, pet_id, reaction_type) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-b000-000000000001', 'HEART'),
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-b000-000000000005', 'PAW'),
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-b000-000000000006', 'BONE'),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-b000-000000000001', 'HEART'),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-b000-000000000003', 'HEART'),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-b000-000000000002', 'PAW'),
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-b000-000000000003', 'PAW'),
  ('00000000-0000-4000-e000-000000000004', '00000000-0000-4000-b000-000000000002', 'BONE'),
  ('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-b000-000000000003', 'HEART');

insert into comments (post_id, author_pet_id, body, created_at) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-b000-000000000005',
   'Nala could never. She drops it immediately.', now() - interval '30 minutes'),
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-b000-000000000001',
   'Teach us your ways.', now() - interval '12 minutes'),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-b000-000000000001',
   'That is a lot of sand for one dog.', now() - interval '2 hours'),
  ('00000000-0000-4000-e000-000000000004', '00000000-0000-4000-b000-000000000002',
   'Four stars is generous, it was mostly foam.', now() - interval '2 days');

-- ── 10. Safety alerts ───────────────────────────────────────

insert into lost_pet_alerts
  (id, pet_id, reporter_id, last_seen_location, last_seen_at,
   description, contact_info, status, created_at)
values
  ('00000000-0000-4000-f000-000000000001',
   '00000000-0000-4000-b000-000000000007',
   '00000000-0000-4000-a000-000000000006',
   st_setsrid(st_makepoint(-122.4290, 37.7720), 4326)::geography,
   now() - interval '5 hours',
   'Slipped out the back gate during the storm. Very shy — will freeze rather than run. Please do not chase.',
   'priya@pawbook.test · 555-0142',
   'ACTIVE', now() - interval '4 hours');

insert into community_alerts
  (id, reporter_id, alert_type, location, radius_km,
   description, expires_at, is_active, created_at)
values
  ('00000000-0000-4000-f000-000000000002',
   '00000000-0000-4000-a000-000000000002', 'DANGEROUS_DOG',
   st_setsrid(st_makepoint(-122.4348, 37.7768), 4326)::geography, 2,
   'Off-leash dog showing aggression near the north gate of Alamo Square. Owner not present.',
   now() + interval '3 hours', true, now() - interval '55 minutes'),

  ('00000000-0000-4000-f000-000000000003',
   '00000000-0000-4000-a000-000000000004', 'WILDLIFE',
   st_setsrid(st_makepoint(-122.5030, 37.7155), 4326)::geography, 3,
   'Coyote sighting on the Fort Funston trail around dusk. Keep small dogs leashed.',
   now() + interval '9 hours', true, now() - interval '4 hours');

-- ── 11. Notifications for the demo account ──────────────────
insert into notifications (recipient_id, type, payload, is_read, created_at) values
  ('00000000-0000-4000-a000-000000000001', 'FRIEND_REQUEST',
   jsonb_build_object(
     'from_pet_id',   '00000000-0000-4000-b000-000000000005',
     'from_pet_name', 'Nala',
     'to_pet_id',     '00000000-0000-4000-b000-000000000001'),
   false, now() - interval '2 days'),

  ('00000000-0000-4000-a000-000000000001', 'ALERT_NEARBY',
   jsonb_build_object(
     'alert_id',    '00000000-0000-4000-f000-000000000002',
     'description', 'Dangerous dog reported near Alamo Square'),
   false, now() - interval '55 minutes'),

  ('00000000-0000-4000-a000-000000000001', 'MEETUP_REQUEST',
   jsonb_build_object(
     'meetup_id',    '00000000-0000-4000-d000-000000000002',
     'meetup_title', 'Beach day with Nala',
     'pet_name',     'Nala'),
   false, now() - interval '1 day'),

  ('00000000-0000-4000-a000-000000000001', 'LOST_PET_NEARBY',
   jsonb_build_object(
     'alert_id', '00000000-0000-4000-f000-000000000001',
     'pet_name', 'Sesame'),
   true, now() - interval '4 hours'),

  ('00000000-0000-4000-a000-000000000001', 'COMMENT',
   jsonb_build_object(
     'post_id',  '00000000-0000-4000-e000-000000000003',
     'pet_name', 'Pepper'),
   true, now() - interval '20 hours');

-- ── Summary ─────────────────────────────────────────────────
do $$
declare
  n_users int; n_pets int; n_friends int; n_places int;
  n_meetups int; n_posts int;
begin
  select count(*) into n_users   from auth.users where email like '%@pawbook.test';
  select count(*) into n_pets    from pets;
  select count(*) into n_friends from pet_relationships where rel_type = 'FRIEND';
  select count(*) into n_places  from places;
  select count(*) into n_meetups from meetups;
  select count(*) into n_posts   from posts;

  raise notice '';
  raise notice 'PawBook seed complete';
  raise notice '  % users · % pets · % friendships · % places · % meetups · % posts',
    n_users, n_pets, n_friends, n_places, n_meetups, n_posts;
  raise notice '  login: demo@pawbook.test / pawbook123';
  raise notice '';
end $$;
