import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { runImport, type ImportOptions } from "../../src/import/run-import";
import { clearCatalog, connect, migrateUp, TEST_DATABASE_URL } from "./helpers";

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

const HEADER = "level,official_code,unit_type,name,full_name,parent_official_code";
/** Invented units, not catalog data. */
const V1 = [
  HEADER,
  "province,90,province,Ví Dụ Một,Tỉnh Ví Dụ Một,",
  "province,91,municipality,Ví Dụ Hai,Thành phố Ví Dụ Hai,",
  "commune,90001,ward,Alpha,Phường Alpha,90",
  "commune,90002,commune,Beta,Xã Beta,90",
  "commune,91001,ward,Gamma,Phường Gamma,91",
].join("\n");
const V2 = [
  HEADER,
  "province,90,province,Ví Dụ Một,Tỉnh Ví Dụ Một,",
  "province,91,municipality,Ví Dụ Hai,Thành phố Ví Dụ Hai,",
  "commune,90001,ward,Alpha,Phường Alpha Mới,90",
  "commune,91001,ward,Gamma,Phường Gamma,91",
  "commune,91002,commune,Delta,Xã Delta,91",
].join("\n");
const SUCCESSIONS_V2 = [
  "from_official_code,to_official_code,kind,is_whole,basis,effective_on",
  "90002,90001,merged_into,true,Fixture resolution (invented),2026-01-01",
].join("\n");

describeDb("runImport (needs TEST_DATABASE_URL)", () => {
  let dir: string;
  let pool: Pool;

  const write = async (name: string, content: string): Promise<string> => {
    const path = join(dir, name);
    await writeFile(path, content);
    return path;
  };

  const options = (unitsFile: string, patch: Partial<ImportOptions> = {}): ImportOptions => ({
    unitsFile,
    source: "fixture",
    sourceRef: "test fixture, not real data",
    effectiveOn: "2025-07-01",
    extractedAt: "2026-01-01T00:00:00.000Z",
    apply: false,
    retireWithoutSuccessor: false,
    ...patch,
  });

  const count = async (table: string): Promise<number> => {
    const result = await pool.query<{ n: string }>(`select count(*) as n from location.${table}`);
    return Number(result.rows[0]?.n);
  };

  beforeAll(async () => {
    migrateUp();
    dir = await mkdtemp(join(tmpdir(), "location-import-"));
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
  });

  beforeEach(async () => {
    const db = await connect();
    await clearCatalog(db);
    await db.end();
  });

  afterAll(async () => {
    const db = await connect();
    await clearCatalog(db);
    await db.end();
    await pool.end();
    await rm(dir, { recursive: true, force: true });
  });

  it("a dry run reports what would be written and writes nothing but the run record", async () => {
    const report = await runImport(pool, options(await write("v1.csv", V1)));
    expect(report).toMatchObject({ mode: "dry_run", status: "succeeded", counts: { added: 5, provinces_in_file: 2, communes_in_file: 3 } });
    expect(await count("units")).toBe(0);
    expect(await count("catalog_versions")).toBe(0);
    const runs = await pool.query("select mode, status from location.import_runs");
    expect(runs.rows).toEqual([{ mode: "dry_run", status: "succeeded" }]);
  });

  it("applies once and recognises the same files afterwards", async () => {
    const file = await write("v1.csv", V1);
    const applied = await runImport(pool, options(file, { apply: true }));
    expect(applied).toMatchObject({ status: "succeeded", catalog_version_id: "fixture-2025-07-01" });
    expect(await count("units")).toBe(5);
    const current = await pool.query("select id, is_current, record_counts from location.catalog_versions");
    expect(current.rows).toEqual([{ id: "fixture-2025-07-01", is_current: true, record_counts: { province: 2, commune: 3 } }]);
    const codes = await pool.query<{ code: string }>("select code from location.units");
    expect(codes.rows.every((row) => /^vn_[0-9a-hjkmnp-tv-z]{20}$/.test(row.code))).toBe(true);

    const again = await runImport(pool, options(file, { apply: true }));
    expect(again.status).toBe("already_imported");
    expect(await count("units")).toBe(5);
    expect(await count("catalog_versions")).toBe(1);
  });

  it("a later catalog versions changed units, retires merged ones and records the succession", async () => {
    await runImport(pool, options(await write("v1.csv", V1), { apply: true }));
    const report = await runImport(
      pool,
      options(await write("v2.csv", V2), { apply: true, effectiveOn: "2026-01-01", successionsFile: await write("s2.csv", SUCCESSIONS_V2) }),
    );
    expect(report).toMatchObject({
      status: "succeeded",
      counts: { added: 1, changed: 1, unchanged: 3, retired: 1, successions_added: 1 },
      changed: [{ official_code: "90001", fields: ["full_name"] }],
      retired_codes: ["90002"],
    });

    const alpha = await pool.query("select to_char(valid_from, 'YYYY-MM-DD') as f, to_char(valid_to, 'YYYY-MM-DD') as t, full_name from location.unit_versions where official_code = '90001' order by valid_from");
    expect(alpha.rows).toEqual([
      { f: "2025-07-01", t: "2026-01-01", full_name: "Phường Alpha" },
      { f: "2026-01-01", t: null, full_name: "Phường Alpha Mới" },
    ]);
    const beta = await pool.query("select retired_in_version from location.units u join location.unit_versions v using (code) where v.official_code = '90002'");
    expect(beta.rows).toEqual([{ retired_in_version: "fixture-2026-01-01" }]);
    const successions = await pool.query("select kind, is_whole, basis from location.successions");
    expect(successions.rows).toEqual([{ kind: "merged_into", is_whole: true, basis: "Fixture resolution (invented)" }]);
    const versions = await pool.query("select id, is_current from location.catalog_versions order by effective_on");
    expect(versions.rows).toEqual([{ id: "fixture-2025-07-01", is_current: false }, { id: "fixture-2026-01-01", is_current: true }]);
  });

  it("refuses a disappearing unit without a succession and leaves the database as it was", async () => {
    await runImport(pool, options(await write("v1.csv", V1), { apply: true }));
    const report = await runImport(pool, options(await write("v2.csv", V2), { apply: true, effectiveOn: "2026-01-01" }));
    expect(report.status).toBe("failed");
    expect(report.errors[0]).toContain("disappear without a succession");
    expect(await count("catalog_versions")).toBe(1);
    expect(await count("unit_versions")).toBe(5);
    const failedRun = await pool.query("select status from location.import_runs where status = 'failed'");
    expect(failedRun.rowCount).toBe(1);
  });

  it("refuses a catalog that is not newer than the current one", async () => {
    await runImport(pool, options(await write("v1.csv", V1), { apply: true }));
    const report = await runImport(pool, options(await write("v2.csv", V2), { apply: true, effectiveOn: "2025-07-01", retireWithoutSuccessor: true }));
    expect(report.status).toBe("failed");
    expect(report.errors[0]).toContain("not later than the current catalog");
  });

  it("stops on file errors and on a count that does not match the source", async () => {
    const bad = await runImport(pool, options(await write("bad.csv", `${HEADER}\ncommune,1,ward,,X,\n`)));
    expect(bad.status).toBe("failed");
    expect(bad.errors.length).toBeGreaterThan(1);

    const wrongCount = await runImport(pool, options(await write("v1.csv", V1), { expectProvinces: 34 }));
    expect(wrongCount.errors).toEqual(["expected 34 provinces, the file has 2"]);
  });
});
