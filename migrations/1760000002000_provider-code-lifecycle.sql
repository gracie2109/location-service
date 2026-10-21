-- Up Migration

-- A mapping can be switched off or moved to another unit; who did it, when and why stays on the row.
alter table location.provider_codes
  add column deactivated_at     timestamptz,
  add column deactivated_by     text,
  add column deactivated_reason text,
  add constraint provider_codes_deactivation_recorded check (
    active or (deactivated_at is not null and length(btrim(deactivated_by)) > 0 and length(btrim(deactivated_reason)) > 0));

-- Only GHN's two-level master data is used, so the legacy three-level model is gone until a consumer needs it.
alter table location.provider_codes drop constraint provider_codes_provider_model_check;
alter table location.provider_codes add constraint provider_codes_provider_model_check check (provider_model = 'ghn_v2');
alter table location.provider_code_proposals drop constraint provider_code_proposals_provider_model_check;
alter table location.provider_code_proposals add constraint provider_code_proposals_provider_model_check check (provider_model = 'ghn_v2');

-- Nothing is linked from a state code (GHN sends none), so every mapping is confirmed by a person.
alter table location.provider_codes drop constraint provider_codes_match_method_check;
alter table location.provider_codes add constraint provider_codes_match_method_check check (match_method = 'confirmed');

-- Down Migration
alter table location.provider_codes drop constraint provider_codes_match_method_check;
alter table location.provider_codes add constraint provider_codes_match_method_check check (match_method in ('official_code', 'confirmed'));
alter table location.provider_code_proposals drop constraint provider_code_proposals_provider_model_check;
alter table location.provider_code_proposals add constraint provider_code_proposals_provider_model_check check (provider_model in ('ghn_v2', 'ghn_legacy'));
alter table location.provider_codes drop constraint provider_codes_provider_model_check;
alter table location.provider_codes add constraint provider_codes_provider_model_check check (provider_model in ('ghn_v2', 'ghn_legacy'));
alter table location.provider_codes
  drop constraint provider_codes_deactivation_recorded,
  drop column deactivated_reason,
  drop column deactivated_by,
  drop column deactivated_at;
