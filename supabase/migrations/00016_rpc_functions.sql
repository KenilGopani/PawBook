-- ============================================================
-- Migration 00016: PostGIS RPC functions
-- All geo-query functions used by Edge Functions.
-- See: 08_service_location.md, 09_service_alerts.md
-- ============================================================

-- ─── Nearby Places ────────────────────────────────────────
-- Used by: places-nearby Edge Function
create or replace function places_nearby(
  p_lat float,
  p_lng float,
  p_radius_m float,
  p_type text default null,
  p_limit int default 20
)
returns table (
  id uuid,
  name text,
  type text,
  address text,
  avg_rating numeric,
  review_count int4,
  tags text[],
  is_verified boolean,
  lat float,
  lng float,
  distance_m float
)
language sql stable as $$
  select
    id, name, type, address, avg_rating, review_count,
    tags, is_verified,
    st_y(location::geometry) as lat,
    st_x(location::geometry) as lng,
    st_distance(location, st_makepoint(p_lng, p_lat)::geography) as distance_m
  from places
  where is_active = true
    and st_dwithin(location, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
    and (p_type is null or type = p_type)
  order by distance_m asc
  limit p_limit;
$$;

-- ─── Search Places (pg_trgm + geo bias) ──────────────────
-- Used by: search-places Edge Function
create or replace function search_places(
  p_query text,
  p_lat float default null,
  p_lng float default null,
  p_type text default null,
  p_limit int default 20
)
returns table (
  id uuid, name text, type text, address text,
  avg_rating numeric, tags text[], is_verified boolean,
  lat float, lng float, distance_m float, similarity float
)
language sql stable as $$
  select
    id, name, type, address, avg_rating, tags, is_verified,
    st_y(location::geometry) as lat,
    st_x(location::geometry) as lng,
    case when p_lat is not null
      then st_distance(location, st_makepoint(p_lng, p_lat)::geography)
      else null end as distance_m,
    similarity(name, p_query) as similarity
  from places
  where is_active = true
    and (p_type is null or type = p_type)
    and name % p_query  -- pg_trgm similarity match
  order by
    case when p_lat is not null
      then st_distance(location, st_makepoint(p_lng, p_lat)::geography)
      else 0 end asc,
    similarity desc
  limit p_limit;
$$;

-- ─── Nearby Pet Owners ───────────────────────────────────
-- Used by: nearby-pets Edge Function
create or replace function nearby_pet_owners(
  p_lat float, p_lng float,
  p_radius_m float, p_limit int
)
returns table (
  owner_id uuid, display_name text, avatar_url text,
  city text, distance_m float,
  pet_id uuid, pet_name text, pet_breed text, pet_avatar_url text,
  pet_species text, pet_temperament text[], pet_size text
)
language sql stable as $$
  select
    pr.id as owner_id, pr.display_name, pr.avatar_url, pr.city,
    st_distance(pr.location, st_makepoint(p_lng, p_lat)::geography) as distance_m,
    p.id as pet_id, p.name as pet_name, p.breed as pet_breed,
    p.avatar_url as pet_avatar_url, p.species as pet_species,
    p.temperament as pet_temperament, p.size as pet_size
  from profiles pr
  join pets p on p.owner_id = pr.id
  where pr.location is not null
    and st_dwithin(pr.location, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
    and p.is_active = true
    and pr.is_active = true
  order by distance_m asc
  limit p_limit;
$$;

-- ─── Users Within Radius ─────────────────────────────────
-- Used by: create-lost-pet-alert, create-community-alert (batch notify)
create or replace function users_within_radius(
  p_lat float,
  p_lng float,
  p_radius_m float
)
returns table (id uuid)
language sql stable as $$
  select id from profiles
  where is_active = true
    and location is not null
    and st_dwithin(
      location,
      st_makepoint(p_lng, p_lat)::geography,
      p_radius_m
    );
$$;

-- ─── Lost Pets Nearby ────────────────────────────────────
-- Used by: lost-pets-nearby Edge Function
create or replace function lost_pets_nearby(
  p_lat float, p_lng float,
  p_radius_m float, p_limit int default 20
)
returns table (
  id uuid, pet_id uuid, description text, contact_info text,
  photo_url text, last_seen_at timestamptz, status text,
  last_seen_lat float, last_seen_lng float, distance_m float
)
language sql stable as $$
  select
    id, pet_id, description, contact_info, photo_url,
    last_seen_at, status,
    st_y(last_seen_location::geometry) as last_seen_lat,
    st_x(last_seen_location::geometry) as last_seen_lng,
    st_distance(last_seen_location, st_makepoint(p_lng, p_lat)::geography) as distance_m
  from lost_pet_alerts
  where status = 'ACTIVE'
    and st_dwithin(
      last_seen_location,
      st_makepoint(p_lng, p_lat)::geography,
      p_radius_m
    )
  order by distance_m asc
  limit p_limit;
$$;

-- ─── Community Alerts Nearby ─────────────────────────────
-- Used by: community-alerts-nearby Edge Function
create or replace function community_alerts_nearby(
  p_lat float, p_lng float, p_radius_m float
)
returns table (
  id uuid, alert_type text, description text,
  radius_km numeric, expires_at timestamptz,
  lat float, lng float, distance_m float,
  reporter_display_name text, created_at timestamptz
)
language sql stable as $$
  select
    ca.id, ca.alert_type, ca.description, ca.radius_km, ca.expires_at,
    st_y(ca.location::geometry) as lat,
    st_x(ca.location::geometry) as lng,
    st_distance(ca.location, st_makepoint(p_lng, p_lat)::geography) as distance_m,
    pr.display_name as reporter_display_name,
    ca.created_at
  from community_alerts ca
  join profiles pr on pr.id = ca.reporter_id
  where ca.is_active = true
    and ca.expires_at > now()
    and st_dwithin(ca.location, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
  order by distance_m asc;
$$;
