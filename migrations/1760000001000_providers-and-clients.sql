-- Up Migration

-- Confirmed mapping between a unit and a carrier's own identifiers. Never created from a name alone.
create table location.provider_codes (
  id                   bigint generated always as identity primary key,
  code                 text not null references location.units (code),
  provider             text not null check (provider in ('ghn')),
  provider_model       text not null check (provider_model in ('ghn_v2', 'ghn_legacy')),
  provider_code        text not null check (length(btrim(provider_code)) > 0),
  provider_parent_code text,
  provider_name        text not null check (length(btrim(provider_name)) > 0),
  match_method         text not null check (match_method in ('official_code', 'confirmed')),
  confirmed_by         text not null check (length(btrim(confirmed_by)) > 0),
  confirmed_at         timestamptz not null default now(),
  active               boolean not null default true
);
-- One live mapping per unit and model, and one unit per carrier code.
create unique index provider_codes_unit_live on location.provider_codes (code, provider, provider_model) where active;
create unique index provider_codes_carrier_live on location.provider_codes (provider, provider_model, provider_code) where active;

-- What a sync found at the carrier, waiting for a person to confirm or reject it.
create table location.provider_code_proposals (
  id                   bigint generated always as identity primary key,
  provider             text not null check (provider in ('ghn')),
  provider_model       text not null check (provider_model in ('ghn_v2', 'ghn_legacy')),
  level                text not null check (level in ('province', 'commune')),
  provider_code        text not null,
  provider_parent_code text,
  provider_name        text not null,
  provider_status      integer,
  suggested_code       text references location.units (code),
  reason               text not null check (reason in ('exact_name', 'ambiguous', 'no_match')),
  candidate_codes      text[] not null default '{}',
  status               text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  synced_at            timestamptz not null default now(),
  decided_by           text,
  decided_at           timestamptz,
  unique (provider, provider_model, provider_code)
);
create index provider_code_proposals_pending on location.provider_code_proposals (provider, provider_model, status);

-- Server-to-server API keys. Only a SHA-256 of the secret is stored.
create table location.api_clients (
  id                 bigint generated always as identity primary key,
  name               text not null unique check (length(btrim(name)) > 0),
  key_prefix         text not null unique check (key_prefix ~ '^[a-z0-9]{8}$'),
  key_hash           text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes             text[] not null check (scopes <> '{}' and scopes <@ array['catalog:snapshot', 'provider-codes:read']),
  rate_limit_per_min integer not null default 120 check (rate_limit_per_min between 1 and 6000),
  created_at         timestamptz not null default now(),
  revoked_at         timestamptz
);

-- Down Migration
drop table location.api_clients;
drop table location.provider_code_proposals;
drop table location.provider_codes;
