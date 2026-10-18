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
