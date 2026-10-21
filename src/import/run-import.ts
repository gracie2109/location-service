import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import { buildPlan } from "./plan";
import { describePlan, emptyReport, formatIssues, type ImportMode, type ImportReport } from "./report";
import { parseSuccessionsFile } from "./successions-file";
import type { CurrentUnit, Plan } from "./types";
import { newUnitCode } from "./unit-code";
import { parseUnitsFile } from "./units-file";

export type ImportOptions = {
  unitsFile: string;
  successionsFile?: string;
  source: "gso" | "legacy_gso" | "fixture";
  sourceRef: string;
  effectiveOn: string;
  extractedAt: string;
  /** Catalog version id; defaults to `<source>-<effectiveOn>`. */
  catalogId?: string;
  apply: boolean;
  retireWithoutSuccessor: boolean;
  /** Levels allowed to retire without a succession. */
  retireLevels?: string[];
  expectProvinces?: number;
  expectDistricts?: number;
  expectCommunes?: number;
};

const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");

const defaultCatalogId = (options: ImportOptions): string => options.catalogId ?? `${options.source.replace("_", "-")}-${options.effectiveOn}`;

const loadCurrentUnits = async (client: PoolClient): Promise<CurrentUnit[]> => {
  const result = await client.query<{
    code: string; level: string; official_code: string | null; unit_type: string; name: string; full_name: string;
    name_en: string | null; full_name_en: string | null; en_names_source: string | null; parent_code: string | null;
    centroid_lat: number | null; centroid_lon: number | null; centroid_source: string | null; valid_from: string;
  }>(
    `select uv.code, u.level, uv.official_code, uv.unit_type, uv.name, uv.full_name, uv.name_en, uv.full_name_en,
            uv.en_names_source, uv.parent_code, uv.centroid_lat, uv.centroid_lon, uv.centroid_source,
            to_char(uv.valid_from, 'YYYY-MM-DD') as valid_from
       from location.unit_versions uv join location.units u on u.code = uv.code
      where uv.valid_to is null`,
  );
  return result.rows.map((row) => ({
    code: row.code,
    level: row.level,
    officialCode: row.official_code,
    unitType: row.unit_type,
    name: row.name,
    fullName: row.full_name,
    nameEn: row.name_en,
    fullNameEn: row.full_name_en,
    enNamesSource: row.en_names_source,
    parentCode: row.parent_code,
    centroidLat: row.centroid_lat,
    centroidLon: row.centroid_lon,
    centroidSource: row.centroid_source,
    validFrom: row.valid_from,
  }));
};

const insertVersion = async (
  client: PoolClient,
  catalogId: string,
  effectiveOn: string,
  entry: { code: string; parentCode: string | null; unit: Plan["added"][number]["unit"] },
): Promise<void> => {
  const { unit } = entry;
  await client.query(
    `insert into location.unit_versions
       (code, valid_from, official_code, unit_type, name, full_name, name_en, full_name_en, en_names_source,
        parent_code, centroid_lat, centroid_lon, centroid_source, catalog_version_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      entry.code, effectiveOn, unit.officialCode, unit.unitType, unit.name, unit.fullName, unit.nameEn, unit.fullNameEn,
      unit.enNamesSource, entry.parentCode, unit.centroid?.latitude ?? null, unit.centroid?.longitude ?? null, unit.centroidSource, catalogId,
    ],
  );
};

/** Live carrier mappings on the units about to be retired, so nobody finds out from a wrong shipping fee. */
const loadMappingsOfRetired = async (client: PoolClient, codes: string[]): Promise<ImportReport["provider_mappings_to_review"]> => {
  if (codes.length === 0) return [];
  const rows = await client.query<ImportReport["provider_mappings_to_review"][number]>(
    "select code, provider, provider_code, provider_name from location.provider_codes where active and code = any($1) order by provider, provider_code",
    [codes],
  );
  return rows.rows;
};

/** Writes the plan. Order matters: close old versions first so official codes and date ranges never clash. */
const writePlan = async (client: PoolClient, plan: Plan, options: ImportOptions, catalogId: string): Promise<{ added: number; skipped: number }> => {
  for (const retire of plan.retired) {
    await client.query("update location.unit_versions set valid_to = $2 where code = $1 and valid_to is null", [retire.code, options.effectiveOn]);
    await client.query("update location.units set retired_in_version = $2 where code = $1", [retire.code, catalogId]);
  }
  for (const change of plan.changed) {
    await client.query("update location.unit_versions set valid_to = $2 where code = $1 and valid_to is null", [change.code, options.effectiveOn]);
  }
  for (const entry of plan.added) {
    await client.query("insert into location.units (code, level, created_in_version) values ($1, $2, $3)", [entry.code, entry.unit.level, catalogId]);
  }
  for (const entry of [...plan.added, ...plan.changed]) await insertVersion(client, catalogId, options.effectiveOn, entry);

  let added = 0;
  let skipped = 0;
  for (const s of plan.successions) {
    const result = await client.query(
      `insert into location.successions (from_code, to_code, kind, is_whole, basis, effective_on, catalog_version_id)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict (from_code, to_code, kind) do nothing`,
      [s.fromCode, s.toCode, s.kind, s.isWhole, s.basis, s.effectiveOn, catalogId],
    );
    if (result.rowCount) added += 1;
    else skipped += 1;
  }
  return { added, skipped };
};

const recordRun = async (pool: Pool, mode: ImportMode): Promise<number> => {
  const result = await pool.query<{ id: string }>("insert into location.import_runs (mode, status) values ($1, 'running') returning id", [mode]);
  return Number(result.rows[0]?.id);
};

const finishRun = async (pool: Pool, id: number, report: ImportReport): Promise<void> => {
  const catalogId = report.mode === "apply" && report.status !== "failed" ? report.catalog_version_id : null;
  await pool.query(
    "update location.import_runs set status = $2, finished_at = now(), report = $3, catalog_version_id = $4 where id = $1",
    [id, report.status === "failed" ? "failed" : "succeeded", JSON.stringify(report), catalogId],
  );
};

/**
 * Imports one catalog. A dry run does everything an apply does inside a transaction and rolls it back,
 * so the report shows exactly what an apply would write. Re-running the same files is a no-op.
 */
export const runImport = async (pool: Pool, options: ImportOptions): Promise<ImportReport> => {
  const mode: ImportMode = options.apply ? "apply" : "dry_run";
  const unitsBytes = await readFile(options.unitsFile);
  const successionsBytes = options.successionsFile ? await readFile(options.successionsFile) : null;
  const fileSha = sha256(`${sha256(unitsBytes)}:${successionsBytes ? sha256(successionsBytes) : ""}`);
  const report = emptyReport(mode, fileSha);
  const runId = await recordRun(pool, mode);

  try {
    const catalogId = defaultCatalogId(options);
    report.catalog_version_id = catalogId;

    const unitsFile = parseUnitsFile(unitsBytes.toString("utf8"));
    const successionsFile = successionsBytes ? parseSuccessionsFile(successionsBytes.toString("utf8")) : { successions: [], issues: [] };
    report.errors.push(...formatIssues([...unitsFile.issues, ...successionsFile.issues]));
    report.counts.provinces_in_file = unitsFile.units.filter((unit) => unit.level === "province").length;
    report.counts.districts_in_file = unitsFile.units.filter((unit) => unit.level === "district").length;
    report.counts.communes_in_file = unitsFile.units.filter((unit) => unit.level === "commune").length;
    if (options.expectDistricts !== undefined && report.counts.districts_in_file !== options.expectDistricts) {
      report.errors.push(`expected ${options.expectDistricts} districts, the file has ${report.counts.districts_in_file}`);
    }
    if (options.expectProvinces !== undefined && report.counts.provinces_in_file !== options.expectProvinces) {
      report.errors.push(`expected ${options.expectProvinces} provinces, the file has ${report.counts.provinces_in_file}`);
    }
    if (options.expectCommunes !== undefined && report.counts.communes_in_file !== options.expectCommunes) {
      report.errors.push(`expected ${options.expectCommunes} communes, the file has ${report.counts.communes_in_file}`);
    }
    if (report.errors.length > 0) return report;

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("lock table location.catalog_versions in share row exclusive mode");

      const existing = await client.query<{ id: string }>("select id from location.catalog_versions where file_sha256 = $1", [fileSha]);
      if (existing.rows[0]) {
        report.status = "already_imported";
        report.catalog_version_id = existing.rows[0].id;
        await client.query("rollback");
        return report;
      }
      const current = await client.query<{ id: string; effective_on: string }>(
        "select id, to_char(effective_on, 'YYYY-MM-DD') as effective_on from location.catalog_versions where is_current",
      );
      if (current.rows[0] && current.rows[0].effective_on >= options.effectiveOn) {
        report.errors.push(`effective_on ${options.effectiveOn} is not later than the current catalog ${current.rows[0].id} (${current.rows[0].effective_on})`);
        await client.query("rollback");
        return report;
      }

      const taken = await client.query("select 1 from location.catalog_versions where id = $1", [catalogId]);
      if (taken.rowCount) {
        report.errors.push(`catalog version id ${catalogId} already exists with different content; pass --id or a new --effective-on`);
        await client.query("rollback");
        return report;
      }
      const plan = buildPlan(
        {
          effectiveOn: options.effectiveOn,
          current: await loadCurrentUnits(client),
          units: unitsFile.units,
          successions: successionsFile.successions,
          retireWithoutSuccessor: options.retireWithoutSuccessor,
          retireLevels: options.retireLevels,
        },
        newUnitCode,
      );
      describePlan(report, plan);
      report.provider_mappings_to_review = await loadMappingsOfRetired(client, plan.retired.map((entry) => entry.code));
      if (plan.errors.length > 0) {
        report.errors.push(...plan.errors);
        await client.query("rollback");
        return report;
      }

      await client.query("update location.catalog_versions set is_current = false where is_current");
      await client.query(
        `insert into location.catalog_versions (id, source, source_ref, effective_on, extracted_at, file_sha256, record_counts, is_current)
         values ($1, $2, $3, $4, $5, $6, $7, true)`,
        [
          catalogId, options.source, options.sourceRef, options.effectiveOn, options.extractedAt, fileSha,
          JSON.stringify({
            province: report.counts.provinces_in_file,
            ...(report.counts.districts_in_file > 0 ? { district: report.counts.districts_in_file } : {}),
            commune: report.counts.communes_in_file,
          }),
        ],
      );
      const written = await writePlan(client, plan, options, catalogId);
      report.counts.successions_added = written.added;
      report.counts.successions_skipped = written.skipped;

      if (options.apply) await client.query("commit");
      else await client.query("rollback");
      report.status = "succeeded";
      return report;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    report.status = "failed";
    report.errors.push(error instanceof Error ? error.message : "unknown error");
    return report;
  } finally {
    await finishRun(pool, runId, report);
  }
};
