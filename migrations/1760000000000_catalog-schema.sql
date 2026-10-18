-- Up Migration
create extension if not exists unaccent;
create extension if not exists pg_trgm;
create extension if not exists btree_gist;

create schema location;

-- unaccent() is only STABLE; this wrapper pins the dictionary so it can be used in
-- generated columns and indexes. Vietnamese đ/Đ are covered by the default rules.
create function location.immutable_unaccent(text) returns text
  language sql immutable parallel safe strict
  as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- One row per imported catalog file. The checksum makes re-importing the same file a no-op.
create table location.catalog_versions (
  id            text primary key check (id ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  source        text not null check (source in ('gso', 'legacy_gso', 'fixture')),
  source_ref    text not null check (length(btrim(source_ref)) > 0),
  effective_on  date not null,
  extracted_at  timestamptz not null,
  file_sha256   text not null unique check (file_sha256 ~ '^[0-9a-f]{64}$'),
  record_counts jsonb not null default '{}'::jsonb,
  is_current    boolean not null default false,
  imported_at   timestamptz not null default now()
);
create unique index catalog_versions_one_current on location.catalog_versions (is_current) where is_current;

-- One row per import attempt, dry runs included.
create table location.import_runs (
  id                 bigint generated always as identity primary key,
  catalog_version_id text references location.catalog_versions (id),
  mode               text not null check (mode in ('dry_run', 'apply')),
  status             text not null check (status in ('running', 'succeeded', 'failed')),
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  report             jsonb not null default '{}'::jsonb
);

-- The stable identity of an administrative unit. Never reused, never derived from a name.
create table location.units (
  code               text primary key check (code ~ '^vn_[0-9a-hjkmnp-tv-z]{20}$'),
  level              text not null check (level in ('province', 'district', 'commune')),
  created_in_version text not null references location.catalog_versions (id),
  retired_in_version text references location.catalog_versions (id)
);

-- The attributes of a unit over time. Closed rows are kept: history is never overwritten.
create table location.unit_versions (
  id                 bigint generated always as identity primary key,
  code               text not null references location.units (code),
  valid_from         date not null,
  valid_to           date,
  official_code      text check (official_code ~ '^[0-9]{2,5}$'),
  unit_type          text not null check (unit_type in (
                       'province', 'municipality', 'ward', 'commune', 'special_zone',
                       'urban_district', 'rural_district', 'town', 'provincial_city', 'township')),
  name               text not null check (length(btrim(name)) > 0),
  full_name          text not null check (length(btrim(full_name)) > 0),
  name_en            text,
  full_name_en       text,
  en_names_source    text check (en_names_source in ('derived', 'official')),
  parent_code        text references location.units (code),
  centroid_lat       double precision check (centroid_lat between -90 and 90),
  centroid_lon       double precision check (centroid_lon between -180 and 180),
  centroid_source    text,
  catalog_version_id text not null references location.catalog_versions (id),
  search_key         text generated always as (lower(location.immutable_unaccent(full_name))) stored,
  check (valid_to is null or valid_to > valid_from),
  check ((centroid_lat is null) = (centroid_lon is null)),
  check (centroid_lat is null or centroid_source is not null),
  check ((name_en is null and full_name_en is null) or en_names_source is not null),
  -- A unit has at most one version in force on any day.
  constraint unit_versions_no_overlap exclude using gist (
    code with =, daterange(valid_from, valid_to, '[)') with &&)
);
-- In-force units have distinct official codes (string, so leading zeros survive). The length
-- already separates the levels: 2 digits province, 3 district, 5 commune. Units without an
-- official code are not constrained.
create unique index unit_versions_current_official_code on location.unit_versions (official_code)
  where valid_to is null and official_code is not null;
create index unit_versions_current_parent on location.unit_versions (parent_code) where valid_to is null;
create index unit_versions_code on location.unit_versions (code, valid_from);
create index unit_versions_search on location.unit_versions using gin (search_key public.gin_trgm_ops);

-- How units relate across administrative changes. Only loaded from a legal basis, never inferred.
create table location.successions (
  from_code          text not null references location.units (code),
  to_code            text not null references location.units (code),
  kind               text not null check (kind in ('replaced_by', 'merged_into', 'split_into', 'part_transferred_to')),
  is_whole           boolean not null,
  basis              text not null check (length(btrim(basis)) > 0),
  effective_on       date not null,
  catalog_version_id text not null references location.catalog_versions (id),
  primary key (from_code, to_code, kind),
  check (from_code <> to_code)
);
create index successions_to on location.successions (to_code);

-- Down Migration
drop schema location cascade;
drop extension if exists btree_gist;
drop extension if exists pg_trgm;
drop extension if exists unaccent;
