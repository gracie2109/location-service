-- Up Migration

-- Which GHN gateway a mapping (and the proposal behind it) was read from. GHN's test and production
-- gateways can use different ids, so a consumer must know which one it may trust. Every row that exists
-- today was written from the test gateway.
alter table location.provider_codes
  add column provider_environment text not null default 'test' check (provider_environment in ('production', 'test'));
alter table location.provider_code_proposals
  add column provider_environment text not null default 'test' check (provider_environment in ('production', 'test'));

-- A proposal is now one per gateway, so a production sync can propose again what the test sync already settled.
-- The old unique constraint got an automatic name that Postgres shortened; it is the only unique one on the table.
do $$
declare
  v_name text;
begin
  select conname into v_name from pg_constraint where conrelid = 'location.provider_code_proposals'::regclass and contype = 'u';
  execute format('alter table location.provider_code_proposals drop constraint %I', v_name);
end;
$$;
alter table location.provider_code_proposals
  add constraint provider_code_proposals_carrier_key unique (provider, provider_model, provider_environment, provider_code);

-- Down Migration
alter table location.provider_code_proposals drop constraint provider_code_proposals_carrier_key;
alter table location.provider_code_proposals add unique (provider, provider_model, provider_code);
alter table location.provider_code_proposals drop column provider_environment;
alter table location.provider_codes drop column provider_environment;
