import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { Pool } from "pg";
import { PG_POOL } from "../db/db.tokens";
import { buildSnapshot } from "./snapshot";
import type { CatalogInfo, Level, Snapshot, Succession, SuccessionKind, UnitType, UnitVersion } from "./types";

const DAY = "'YYYY-MM-DD'";
const INSTANT = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`;

type CatalogRow = {
  id: string;
  source: string;
  source_ref: string;
  effective_on: string;
  extracted_at: string;
  file_sha256: string;
  record_counts: Record<string, number>;
  is_current: boolean;
  imported_at: string;
};

type UnitVersionRow = {
  code: string;
  level: Level;
  unit_type: UnitType;
  official_code: string | null;
  name: string;
  full_name: string;
  name_en: string | null;
  full_name_en: string | null;
  en_names_source: "derived" | "official" | null;
  parent_code: string | null;
  centroid_lat: number | null;
  centroid_lon: number | null;
  centroid_source: string | null;
  valid_from: string;
  valid_to: string | null;
};

type SuccessionRow = {
  from_code: string;
  to_code: string;
  kind: SuccessionKind;
  is_whole: boolean;
  basis: string;
  effective_on: string;
};

const toCatalogInfo = (row: CatalogRow): CatalogInfo => ({
  id: row.id,
  source: row.source,
  sourceRef: row.source_ref,
  effectiveOn: row.effective_on,
  extractedAt: row.extracted_at,
  fileSha256: row.file_sha256,
  recordCounts: row.record_counts,
  isCurrent: row.is_current,
  importedAt: row.imported_at,
});

const toUnitVersion = (row: UnitVersionRow): Omit<UnitVersion, "nameKey" | "fullKey"> => ({
  code: row.code,
  level: row.level,
  unitType: row.unit_type,
  officialCode: row.official_code,
  name: row.name,
  fullName: row.full_name,
  nameEn: row.name_en,
  fullNameEn: row.full_name_en,
  enNamesSource: row.en_names_source,
  parentCode: row.parent_code,
  centroid:
    row.centroid_lat === null || row.centroid_lon === null
      ? null
      : { latitude: row.centroid_lat, longitude: row.centroid_lon },
  centroidSource: row.centroid_source,
  validFrom: row.valid_from,
  validTo: row.valid_to,
});

const toSuccession = (row: SuccessionRow): Succession => ({
  fromCode: row.from_code,
  toCode: row.to_code,
  kind: row.kind,
  isWhole: row.is_whole,
  basis: row.basis,
  effectiveOn: row.effective_on,
});

@Injectable()
export class CatalogRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool | null) {}

  private requirePool(): Pool {
    if (!this.pool) throw new ServiceUnavailableException();
    return this.pool;
  }

  /** The id of the current catalog version, or null when none is current. */
  async currentVersionId(): Promise<string | null> {
    const result = await this.requirePool().query<{ id: string }>("select id from location.catalog_versions where is_current");
    return result.rows[0]?.id ?? null;
  }

  /** Reads the whole catalog in one consistent transaction; null when no version is current. */
  async loadSnapshot(): Promise<Snapshot | null> {
    const client = await this.requirePool().connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      const versionRows = await client.query<CatalogRow>(
        `select id, source, source_ref, to_char(effective_on, ${DAY}) as effective_on,
                to_char(extracted_at at time zone 'UTC', ${INSTANT}) as extracted_at,
                file_sha256, record_counts, is_current,
                to_char(imported_at at time zone 'UTC', ${INSTANT}) as imported_at
           from location.catalog_versions order by imported_at desc, id`,
      );
      const unitRows = await client.query<UnitVersionRow>(
        `select uv.code, u.level, uv.unit_type, uv.official_code, uv.name, uv.full_name, uv.name_en, uv.full_name_en,
                uv.en_names_source, uv.parent_code, uv.centroid_lat, uv.centroid_lon, uv.centroid_source,
                to_char(uv.valid_from, ${DAY}) as valid_from, to_char(uv.valid_to, ${DAY}) as valid_to
           from location.unit_versions uv join location.units u on u.code = uv.code`,
      );
      const successionRows = await client.query<SuccessionRow>(
        `select from_code, to_code, kind, is_whole, basis, to_char(effective_on, ${DAY}) as effective_on
           from location.successions order by effective_on, from_code, to_code`,
      );
      await client.query("commit");

      const versions = versionRows.rows.map(toCatalogInfo);
      const current = versions.find((version) => version.isCurrent);
      if (!current) return null;
      return buildSnapshot(current, versions, unitRows.rows.map(toUnitVersion), successionRows.rows.map(toSuccession));
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
