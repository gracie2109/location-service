import { execFileSync } from "node:child_process";
import { Client } from "pg";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** Applies every pending migration; safe to call repeatedly. */
export const migrateUp = (): void => {
  execFileSync("node", ["node_modules/node-pg-migrate/bin/node-pg-migrate.js", "up", "--migrations-dir", "migrations"], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
};

export const connect = async (): Promise<Client> => {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  return client;
};

export const clearCatalog = async (client: Client): Promise<void> => {
  await client.query(
    "truncate location.successions, location.unit_versions, location.units, location.import_runs, location.catalog_versions restart identity cascade",
  );
};

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** A syntactically valid unit code for tests; never a real identifier. */
export const testCode = (n: number): string => {
  const tail = Array.from({ length: 20 }, (_, i) => ALPHABET[(n + i * 7) % ALPHABET.length]).join("");
  return `vn_${tail}`;
};

/** Marks rows as test fixtures so they cannot be mistaken for catalog data. */
export const insertFixtureCatalog = async (client: Client, id = "fixture-test-1", current = true): Promise<void> => {
  await client.query(
    `insert into location.catalog_versions (id, source, source_ref, effective_on, extracted_at, file_sha256, is_current)
     values ($1, 'fixture', 'test fixture, not real data', '2025-07-01', now(), $2, $3)`,
    [id, id.padEnd(64, "0").replace(/[^0-9a-f]/g, "a"), current],
  );
};

type FixtureUnitRow = {
  code: string;
  level: string;
  unitType: string;
  officialCode: string | null;
  name: string;
  fullName: string;
  parentCode: string | null;
  validFrom: string;
  validTo: string | null;
};

type FixtureSuccessionRow = { fromCode: string; toCode: string; kind: string; isWhole: boolean; basis: string; effectiveOn: string };

/** Inserts units, their versions and successions under an existing catalog version. */
export const insertFixtureUnits = async (
  client: Client,
  catalogId: string,
  units: FixtureUnitRow[],
  successions: FixtureSuccessionRow[],
): Promise<void> => {
  for (const unit of units) {
    await client.query("insert into location.units (code, level, created_in_version) values ($1, $2, $3)", [unit.code, unit.level, catalogId]);
  }
  for (const unit of units) {
    await client.query(
      `insert into location.unit_versions (code, valid_from, valid_to, official_code, unit_type, name, full_name, parent_code, catalog_version_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [unit.code, unit.validFrom, unit.validTo, unit.officialCode, unit.unitType, unit.name, unit.fullName, unit.parentCode, catalogId],
    );
  }
  for (const s of successions) {
    await client.query(
      `insert into location.successions (from_code, to_code, kind, is_whole, basis, effective_on, catalog_version_id)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [s.fromCode, s.toCode, s.kind, s.isWhole, s.basis, s.effectiveOn, catalogId],
    );
  }
};
