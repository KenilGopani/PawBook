-- ============================================================
-- Migration 00001: Enable required PostgreSQL extensions
-- ============================================================

-- PostGIS — geo queries (ST_DWithin, ST_Distance, geography type)
create extension if not exists postgis;

-- UUID generation fallback
create extension if not exists "uuid-ossp";

-- Fuzzy text search on name/breed fields
create extension if not exists pg_trgm;
