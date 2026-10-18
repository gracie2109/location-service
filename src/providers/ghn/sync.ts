import type { Pool, PoolClient } from "pg";
import { CatalogRepository } from "../../catalog/catalog.repository";
import { GhnClient } from "./ghn-client";
import { matchProvinces, matchWards } from "./matcher";
import type { GhnUnit, Proposal } from "./types";

export const GHN_MODEL = "ghn_v2";
const REPORT_SAMPLE = 50;

export type SyncReport = {
  mode: "dry_run" | "apply";
  status: "succeeded" | "failed";
  catalog_version_id: string | null;
  ghn_provinces: number;
  ghn_wards: number;
  proposals: { exact_name: number; ambiguous: number; no_match: number };
  already_confirmed: number;
  /** GHN provinces without a confirmed mapping: their wards were not fetched. */
  provinces_waiting_for_confirmation: string[];
  /** Confirmed mappings whose GHN record is now renamed, switched off or gone. */
  changed_at_ghn: { provider_code: string; confirmed_name: string; ghn_name: string | null; ghn_status: number | null }[];
  errors: string[];
};

const emptyReport = (apply: boolean): SyncReport => ({
  mode: apply ? "apply" : "dry_run",
  status: "failed",
  catalog_version_id: null,
  ghn_provinces: 0,
  ghn_wards: 0,
  proposals: { exact_name: 0, ambiguous: 0, no_match: 0 },
  already_confirmed: 0,
  provinces_waiting_for_confirmation: [],
  changed_at_ghn: [],
  errors: [],
});

type Confirmed = { provider_code: string; code: string; provider_name: string; level: string };

const loadConfirmed = async (pool: Pool): Promise<Confirmed[]> => {
  const result = await pool.query<Confirmed>(
    `select pc.provider_code, pc.code, pc.provider_name, u.level
       from location.provider_codes pc join location.units u on u.code = pc.code
      where pc.active and pc.provider = 'ghn' and pc.provider_model = $1`,
    [GHN_MODEL],
  );
  return result.rows;
};

const saveProposals = async (db: PoolClient, proposals: Proposal[]): Promise<void> => {
  for (const proposal of proposals) {
    await db.query(
      `insert into location.provider_code_proposals
         (provider, provider_model, level, provider_code, provider_parent_code, provider_name, provider_status, suggested_code, reason, candidate_codes)
       values ('ghn', $1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (provider, provider_model, provider_code) do update set
         level = excluded.level, provider_parent_code = excluded.provider_parent_code, provider_name = excluded.provider_name,
         provider_status = excluded.provider_status, suggested_code = excluded.suggested_code, reason = excluded.reason,
         candidate_codes = excluded.candidate_codes, synced_at = now()
       where location.provider_code_proposals.status = 'pending'`,
      [GHN_MODEL, proposal.level, proposal.providerCode, proposal.providerParentCode, proposal.providerName, proposal.providerStatus, proposal.suggestedCode, proposal.reason, proposal.candidateCodes],
    );
  }
};

/**
 * Reads GHN's two-level master data (GET only) and records, for each province and ward, a proposal for a
 * person to confirm. Wards are fetched only for provinces whose mapping is already confirmed. Dry run
 * does everything except write.
 */
export const runGhnSync = async (pool: Pool, ghn: GhnClient, apply: boolean): Promise<SyncReport> => {
  const report = emptyReport(apply);
  try {
    const snapshot = await new CatalogRepository(pool).loadSnapshot();
    if (!snapshot) {
      report.errors.push("no current catalog; import one first");
      return report;
    }
    report.catalog_version_id = snapshot.catalog.id;

    const confirmed = await loadConfirmed(pool);
    const confirmedCodes = new Set(confirmed.map((row) => row.provider_code));
    const provinceByGhnId = new Map(confirmed.filter((row) => row.level === "province").map((row) => [row.provider_code, row.code]));

    const ghnProvinces = await ghn.provinces();
    report.ghn_provinces = ghnProvinces.length;
    const proposals = matchProvinces(snapshot, ghnProvinces);

    const ghnWards: GhnUnit[] = [];
    for (const province of ghnProvinces) {
      if (!provinceByGhnId.has(String(province.id))) {
        if (province.status === 1) report.provinces_waiting_for_confirmation.push(province.name);
        continue;
      }
      ghnWards.push(...(await ghn.wards(province.id)));
    }
    report.ghn_wards = ghnWards.length;
    proposals.push(...matchWards(snapshot, ghnWards, provinceByGhnId).proposals);

    const seen = new Map([...ghnProvinces, ...ghnWards].map((unit) => [String(unit.id), unit]));
    for (const row of confirmed) {
      const now = seen.get(row.provider_code);
      if (row.level === "commune" && !now && !provinceByGhnId.size) continue;
      if (!now || now.name !== row.provider_name || now.status !== 1) {
        report.changed_at_ghn.push({ provider_code: row.provider_code, confirmed_name: row.provider_name, ghn_name: now?.name ?? null, ghn_status: now?.status ?? null });
      }
    }
    report.changed_at_ghn = report.changed_at_ghn.slice(0, REPORT_SAMPLE);

    const open = proposals.filter((proposal) => !confirmedCodes.has(proposal.providerCode));
    report.already_confirmed = proposals.length - open.length;
    for (const proposal of open) report.proposals[proposal.reason] += 1;

    const db = await pool.connect();
    try {
      await db.query("begin");
      await saveProposals(db, open);
      await db.query(apply ? "commit" : "rollback");
    } catch (error) {
      await db.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      db.release();
    }
    report.status = "succeeded";
    return report;
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : "sync failed");
    return report;
  }
};
