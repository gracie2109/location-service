import type { Client } from "pg";
import { clearCatalog, connect, insertFixtureCatalog, migrateUp, TEST_DATABASE_URL, testCode } from "./helpers";

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb("catalog schema (needs TEST_DATABASE_URL)", () => {
  let db: Client;

  beforeAll(async () => {
    migrateUp();
    db = await connect();
  });

  afterAll(async () => {
    await clearCatalog(db);
    await db.end();
  });

  beforeEach(async () => {
    await clearCatalog(db);
    await insertFixtureCatalog(db);
  });

  const addUnit = (code: string, level = "commune") =>
    db.query("insert into location.units (code, level, created_in_version) values ($1, $2, 'fixture-test-1')", [code, level]);

  const addVersion = (code: string, over: Record<string, unknown> = {}) => {
    const row = {
      valid_from: "2025-07-01",
      valid_to: null,
      official_code: null,
      unit_type: "ward",
      name: "Ví Dụ",
      full_name: "Phường Ví Dụ",
      parent_code: null,
      ...over,
    };
    return db.query(
      `insert into location.unit_versions (code, valid_from, valid_to, official_code, unit_type, name, full_name, parent_code, catalog_version_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'fixture-test-1')`,
      [code, row.valid_from, row.valid_to, row.official_code, row.unit_type, row.name, row.full_name, row.parent_code],
    );
  };

  it("rejects malformed unit codes and unknown levels", async () => {
    await expect(addUnit("vn_short")).rejects.toThrow(/units_code_check/);
    await expect(addUnit(testCode(1), "country")).rejects.toThrow(/units_level_check/);
  });

  it("rejects a second current catalog and a repeated checksum", async () => {
    await expect(insertFixtureCatalog(db, "fixture-test-2", true)).rejects.toThrow(/catalog_versions_one_current/);
    await db.query("update location.catalog_versions set file_sha256 = repeat('b', 64)");
    await expect(
      db.query(
        `insert into location.catalog_versions (id, source, source_ref, effective_on, extracted_at, file_sha256)
         values ('fixture-test-3', 'fixture', 'x', '2025-07-01', now(), repeat('b', 64))`,
      ),
    ).rejects.toThrow(/file_sha256_key/);
  });

  it("validates official codes and keeps leading zeros", async () => {
    await addUnit(testCode(2), "province");
    await expect(addVersion(testCode(2), { official_code: "1" })).rejects.toThrow(/official_code_check/);
    await addVersion(testCode(2), { official_code: "01", unit_type: "province", name: "A", full_name: "Tỉnh A" });
    const { rows } = await db.query("select official_code from location.unit_versions");
    expect(rows[0].official_code).toBe("01");
  });

  it("allows only one in-force unit per official code but keeps closed history", async () => {
    await addUnit(testCode(3));
    await addUnit(testCode(4));
    await addVersion(testCode(3), { official_code: "00001", valid_from: "2020-01-01", valid_to: "2025-07-01" });
    await addVersion(testCode(3), { official_code: "00001" });
    await expect(addVersion(testCode(4), { official_code: "00001" })).rejects.toThrow(/current_official_code/);
    const { rows } = await db.query("select count(*)::int as n from location.unit_versions where official_code = '00001'");
    expect(rows[0].n).toBe(2);
  });

  it("rejects overlapping versions of the same unit and inverted dates", async () => {
    await addUnit(testCode(5));
    await addVersion(testCode(5), { valid_from: "2020-01-01", valid_to: "2025-07-01" });
    await expect(addVersion(testCode(5), { valid_from: "2024-01-01" })).rejects.toThrow(/unit_versions_no_overlap/);
    await expect(addVersion(testCode(5), { valid_from: "2026-01-01", valid_to: "2025-01-01" })).rejects.toThrow(/valid_to_check|check/);
  });

  it("requires centroids to be complete, in range and sourced", async () => {
    await addUnit(testCode(6));
    const insert = (lat: unknown, lon: unknown, source: unknown) =>
      db.query(
        `insert into location.unit_versions (code, valid_from, unit_type, name, full_name, centroid_lat, centroid_lon, centroid_source, catalog_version_id)
         values ($1, '2025-07-01', 'ward', 'A', 'Phường A', $2, $3, $4, 'fixture-test-1')`,
        [testCode(6), lat, lon, source],
      );
    await expect(insert(10, null, "x")).rejects.toThrow(/check/);
    await expect(insert(95, 100, "x")).rejects.toThrow(/centroid_lat_check/);
    await expect(insert(10, 100, null)).rejects.toThrow(/check/);
    await insert(10, 100, "test fixture");
  });

  it("requires a provenance for English names", async () => {
    await addUnit(testCode(7));
    await expect(
      db.query(
        `insert into location.unit_versions (code, valid_from, unit_type, name, full_name, name_en, full_name_en, catalog_version_id)
         values ($1, '2025-07-01', 'ward', 'A', 'Phường A', 'A', 'A Ward', 'fixture-test-1')`,
        [testCode(7)],
      ),
    ).rejects.toThrow(/check/);
  });

  it("builds an accent-free search key and finds names with trigram search", async () => {
    await addUnit(testCode(8));
    await addVersion(testCode(8), { name: "Đông Hà", full_name: "Phường Đông Hà" });
    const key = await db.query("select search_key from location.unit_versions");
    expect(key.rows[0].search_key).toBe("phuong dong ha");
    const hit = await db.query("select code from location.unit_versions where search_key like $1", ["%dong ha%"]);
    expect(hit.rowCount).toBe(1);
  });

  it("keeps successions tied to real units and a legal basis", async () => {
    await addUnit(testCode(9));
    await addUnit(testCode(10));
    const insert = (from: string, to: string, basis: string) =>
      db.query(
        `insert into location.successions (from_code, to_code, kind, is_whole, basis, effective_on, catalog_version_id)
         values ($1, $2, 'merged_into', true, $3, '2025-07-01', 'fixture-test-1')`,
        [from, to, basis],
      );
    await expect(insert(testCode(9), testCode(9), "x")).rejects.toThrow(/check/);
    await expect(insert(testCode(9), testCode(11), "x")).rejects.toThrow(/foreign key/);
    await expect(insert(testCode(9), testCode(10), " ")).rejects.toThrow(/basis_check/);
    await insert(testCode(9), testCode(10), "test resolution");
  });

  it("does not delete a unit that history still points at", async () => {
    await addUnit(testCode(12));
    await addVersion(testCode(12));
    await expect(db.query("delete from location.units where code = $1", [testCode(12)])).rejects.toThrow(/foreign key/);
  });
});
