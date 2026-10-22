import type { Pool, PoolClient } from "pg";
import { refuseUnit, type Decision } from "./decisions";
import { GHN_MODEL, type GhnEnvironment } from "./sync";

type MappingRow = {
  id: string;
  code: string;
  provider_code: string;
  provider_parent_code: string | null;
  provider_name: string;
  provider_environment: GhnEnvironment;
  level: string;
};

const fail = (message: string): Decision => ({ ok: false, message });

const lockMapping = async (db: PoolClient, providerCode: string): Promise<MappingRow | undefined> =>
  (
    await db.query<MappingRow>(
      `select pc.id, pc.code, pc.provider_code, pc.provider_parent_code, pc.provider_name, pc.provider_environment, u.level
         from location.provider_codes pc join location.units u on u.code = pc.code
        where pc.active and pc.provider = 'ghn' and pc.provider_model = $1 and pc.provider_code = $2 for update of pc`,
      [GHN_MODEL, providerCode],
    )
  ).rows[0];

const deactivateRow = (db: PoolClient, id: string, by: string, reason: string) =>
  db.query("update location.provider_codes set active = false, deactivated_at = now(), deactivated_by = $2, deactivated_reason = $3 where id = $1", [id, by, reason]);

/** Runs `work` in one transaction; a refused decision is rolled back, so nothing is half done. */
const inTransaction = async (pool: Pool, work: (db: PoolClient) => Promise<Decision>): Promise<Decision> => {
  const db = await pool.connect();
  try {
    await db.query("begin");
    const decision = await work(db);
    await db.query(decision.ok ? "commit" : "rollback");
    return decision;
  } catch {
    await db.query("rollback").catch(() => undefined);
    return fail("could not save the change");
  } finally {
    db.release();
  }
};

const requireReason = (by: string, reason: string): string | null =>
  by.trim() && reason.trim() ? null : "--by and --reason are required";

/** Switches a mapping off without choosing a successor (the GHN record is gone or the unit has no counterpart). */
export const deactivateMapping = (pool: Pool, providerCode: string, by: string, reason: string): Promise<Decision> =>
  inTransaction(pool, async (db) => {
    const missing = requireReason(by, reason);
    if (missing) return fail(missing);
    const mapping = await lockMapping(db, providerCode);
    if (!mapping) return fail(`no live GHN mapping with code ${providerCode}`);
    await deactivateRow(db, mapping.id, by, reason);
    return { ok: true, message: `deactivated GHN ${providerCode} (${mapping.provider_name}) on ${mapping.code}` };
  });

/** Moves a live GHN code to another unit, for example after the old unit was merged. The old row is kept, switched off. */
export const replaceMapping = (pool: Pool, providerCode: string, unitCode: string, by: string, reason: string): Promise<Decision> =>
  inTransaction(pool, async (db) => {
    const missing = requireReason(by, reason);
    if (missing) return fail(missing);
    const mapping = await lockMapping(db, providerCode);
    if (!mapping) return fail(`no live GHN mapping with code ${providerCode}`);
    if (mapping.code === unitCode) return fail(`GHN ${providerCode} is already mapped to ${unitCode}`);
    const refusal = await refuseUnit(db, mapping, unitCode, mapping.provider_environment);
    if (refusal) return fail(refusal);
    await deactivateRow(db, mapping.id, by, reason);
    await db.query(
      `insert into location.provider_codes (code, provider, provider_model, provider_environment, provider_code, provider_parent_code, provider_name, match_method, confirmed_by)
       values ($1, 'ghn', $2, $7, $3, $4, $5, 'confirmed', $6)`,
      [unitCode, GHN_MODEL, providerCode, mapping.provider_parent_code, mapping.provider_name, by, mapping.provider_environment],
    );
    return { ok: true, message: `GHN ${providerCode} moved from ${mapping.code} to ${unitCode}` };
  });
