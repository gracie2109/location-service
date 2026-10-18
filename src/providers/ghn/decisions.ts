import type { Pool } from "pg";
import { GHN_MODEL } from "./sync";

export type Decision =
  | { ok: true; message: string }
  | { ok: false; message: string };

type ProposalRow = {
  id: string;
  level: string;
  provider_code: string;
  provider_parent_code: string | null;
  provider_name: string;
  status: string;
  suggested_code: string | null;
};

const fail = (message: string): Decision => ({ ok: false, message });

/** Confirms one proposal for a unit chosen by a person. Everything happens in one transaction. */
export const confirmProposal = async (pool: Pool, providerCode: string, unitCode: string, by: string): Promise<Decision> => {
  const db = await pool.connect();
  try {
    await db.query("begin");
    const proposal = (
      await db.query<ProposalRow>(
        "select id, level, provider_code, provider_parent_code, provider_name, status, suggested_code from location.provider_code_proposals where provider = 'ghn' and provider_model = $1 and provider_code = $2 for update",
        [GHN_MODEL, providerCode],
      )
    ).rows[0];
    if (!proposal) return fail(`no GHN proposal with code ${providerCode}; run sync first`);
    if (proposal.status !== "pending") return fail(`proposal ${providerCode} is already ${proposal.status}`);

    const unit = (await db.query<{ level: string }>("select level from location.units where code = $1", [unitCode])).rows[0];
    if (!unit) return fail(`unit ${unitCode} does not exist`);
    if (unit.level !== proposal.level) return fail(`unit ${unitCode} is a ${unit.level}, the GHN record is a ${proposal.level}`);

    await db.query(
      `insert into location.provider_codes (code, provider, provider_model, provider_code, provider_parent_code, provider_name, match_method, confirmed_by)
       values ($1, 'ghn', $2, $3, $4, $5, 'confirmed', $6)`,
      [unitCode, GHN_MODEL, providerCode, proposal.provider_parent_code, proposal.provider_name, by],
    );
    await db.query("update location.provider_code_proposals set status = 'confirmed', decided_by = $2, decided_at = now() where id = $1", [proposal.id, by]);
    await db.query("commit");
    return { ok: true, message: `GHN ${providerCode} (${proposal.provider_name}) → ${unitCode}` };
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    const message = error instanceof Error && /provider_codes_(unit|carrier)_live/.test(error.message) ? "that unit or GHN code already has a live mapping" : "could not save the decision";
    return fail(message);
  } finally {
    db.release();
  }
};

export const rejectProposal = async (pool: Pool, providerCode: string, by: string): Promise<Decision> => {
  const result = await pool.query(
    "update location.provider_code_proposals set status = 'rejected', decided_by = $3, decided_at = now() where provider = 'ghn' and provider_model = $1 and provider_code = $2 and status = 'pending'",
    [GHN_MODEL, providerCode, by],
  );
  return result.rowCount ? { ok: true, message: `rejected GHN ${providerCode}` } : fail(`no pending proposal ${providerCode}`);
};

/** Confirms every pending proposal whose only candidate is the suggestion (reason exact_name) at one level. */
export const confirmAllExact = async (pool: Pool, level: "province" | "commune", by: string): Promise<Decision[]> => {
  const rows = await pool.query<{ provider_code: string; suggested_code: string }>(
    "select provider_code, suggested_code from location.provider_code_proposals where provider = 'ghn' and provider_model = $1 and level = $2 and status = 'pending' and reason = 'exact_name' and suggested_code is not null order by provider_code",
    [GHN_MODEL, level],
  );
  const decisions: Decision[] = [];
  for (const row of rows.rows) decisions.push(await confirmProposal(pool, row.provider_code, row.suggested_code, by));
  return decisions;
};
