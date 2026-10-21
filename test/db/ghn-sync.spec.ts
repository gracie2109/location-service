import { Pool } from "pg";
import { confirmAllExact, confirmProposal, rejectProposal } from "../../src/providers/ghn/decisions";
import { GhnClient } from "../../src/providers/ghn/ghn-client";
import { deactivateMapping, replaceMapping } from "../../src/providers/ghn/lifecycle";
import { runGhnSync } from "../../src/providers/ghn/sync";
import { code, FIXTURE_SUCCESSIONS, FIXTURE_VERSION_ID, fixtureDbRows } from "../fixtures";
import { clearCatalog, connect, insertFixtureCatalog, insertFixtureUnits, migrateUp, TEST_DATABASE_URL } from "./helpers";

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

const unit = (id: number, name: string, parent: number, status = 1) => ({ _id: id, name, extension_names: [], type: "x", parent_id: parent, status });
let provinces = [unit(1000001, "Ví Dụ Một", 1), unit(1000002, "Ví Dụ Hai", 1), unit(1000003, "Tỉnh Không Có", 1)];
let wards: Record<string, ReturnType<typeof unit>[]> = {};

/** A GHN stand-in: answers the two documented endpoints from the variables above. */
const fakeFetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  if (url.pathname.endsWith("/province/all")) return new Response(JSON.stringify({ code: 200, data: provinces }));
  const list = wards[url.searchParams.get("province_id") ?? ""];
  return new Response(JSON.stringify({ code: 200, data: list ?? null }));
}) as typeof fetch;

describeDb("GHN sync and confirmation (needs TEST_DATABASE_URL)", () => {
  let pool: Pool;
  const client = () => new GhnClient({ token: "t", shopId: "1", baseUrl: "https://ghn.example.invalid" }, fakeFetch, 0);
  const count = async (table: string, where = "true") =>
    Number((await pool.query<{ n: string }>(`select count(*) as n from location.${table} where ${where}`)).rows[0]?.n);

  beforeAll(async () => {
    migrateUp();
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
  });

  beforeEach(async () => {
    const db = await connect();
    await clearCatalog(db);
    await insertFixtureCatalog(db, FIXTURE_VERSION_ID);
    await insertFixtureUnits(db, FIXTURE_VERSION_ID, fixtureDbRows(), FIXTURE_SUCCESSIONS);
    await db.end();
    provinces = [unit(1000001, "Ví Dụ Một", 1), unit(1000002, "Ví Dụ Hai", 1), unit(1000003, "Tỉnh Không Có", 1)];
    wards = {
      "1000001": [unit(1003646, "Phường Ví Dụ Alpha", 1000001), unit(1003647, "Xã Ví Dụ Beta", 1000001), unit(1003648, "Xã Lạ", 1000001)],
      "1000002": [unit(1009999, "Phường Ví Dụ Alpha", 1000002)],
    };
  });

  afterAll(async () => {
    const db = await connect();
    await clearCatalog(db);
    await db.end();
    await pool.end();
  });

  it("a dry run reports proposals and writes nothing", async () => {
    const report = await runGhnSync(pool, client(), false);
    expect(report).toMatchObject({ status: "succeeded", mode: "dry_run", ghn_provinces: 3, proposals: { exact_name: 2, no_match: 1, ambiguous: 0 } });
    expect(report.provinces_waiting_for_confirmation).toEqual(["Ví Dụ Một", "Ví Dụ Hai", "Tỉnh Không Có"]);
    expect(await count("provider_code_proposals")).toBe(0);
  });

  it("fetches wards only after their province is confirmed, then suggests matches inside that province", async () => {
    expect((await runGhnSync(pool, client(), true)).status).toBe("succeeded");
    expect(await count("provider_code_proposals")).toBe(3);
    expect(await count("provider_code_proposals", "level = 'commune'")).toBe(0);

    const decisions = await confirmAllExact(pool, "province", "tester");
    expect(decisions.every((d) => d.ok)).toBe(true);
    expect(await count("provider_codes", "active")).toBe(2);

    const second = await runGhnSync(pool, client(), true);
    expect(second).toMatchObject({ ghn_wards: 4, already_confirmed: 2, provinces_waiting_for_confirmation: ["Tỉnh Không Có"] });
    expect(second.proposals).toEqual({ exact_name: 3, ambiguous: 0, no_match: 2 });

    const rows = await pool.query("select provider_code, suggested_code, provider_parent_code from location.provider_code_proposals where level = 'commune' and reason = 'exact_name' order by provider_code");
    expect(rows.rows).toEqual([
      { provider_code: "1003646", suggested_code: code(3), provider_parent_code: "1000001" },
      { provider_code: "1003647", suggested_code: code(4), provider_parent_code: "1000001" },
      { provider_code: "1009999", suggested_code: code(6), provider_parent_code: "1000002" },
    ]);
  });

  it("confirms a chosen unit, refuses a wrong level or a second claim, and leaves decided rows alone on re-sync", async () => {
    await runGhnSync(pool, client(), true);
    await confirmAllExact(pool, "province", "tester");
    await runGhnSync(pool, client(), true);

    expect(await confirmProposal(pool, "1003648", code(1), "tester")).toMatchObject({ ok: false });
    expect(await confirmProposal(pool, "1003648", code(5), "tester")).toMatchObject({ ok: true });
    expect(await confirmProposal(pool, "1003648", code(5), "tester")).toMatchObject({ ok: false });
    expect(await confirmProposal(pool, "1003646", code(5), "tester")).toMatchObject({ ok: false, message: "that unit or GHN code already has a live mapping" });
    expect(await rejectProposal(pool, "1003647", "tester")).toMatchObject({ ok: true });

    wards["1000001"] = [unit(1003646, "Phường Ví Dụ Alpha Đổi Tên", 1000001), unit(1003647, "Xã Ví Dụ Beta", 1000001), unit(1003648, "Xã Lạ", 1000001)];
    const third = await runGhnSync(pool, client(), true);
    const rejected = await pool.query("select status from location.provider_code_proposals where provider_code = '1003647'");
    expect(rejected.rows).toEqual([{ status: "rejected" }]);
    expect(third.changed_at_ghn).toEqual([]);
    expect(await count("provider_codes", "active and provider_code = '1003648'")).toBe(1);
  });

  it("refuses a retired unit or a unit of another province, and never leaves a transaction open", async () => {
    await runGhnSync(pool, client(), true);
    await confirmAllExact(pool, "province", "tester");
    await runGhnSync(pool, client(), true);

    expect(await confirmProposal(pool, "1003648", code(8), "tester")).toMatchObject({ ok: false, message: expect.stringContaining("retired") });
    expect(await confirmProposal(pool, "1003648", code(6), "tester")).toMatchObject({ ok: false, message: expect.stringContaining("another province") });
    expect(await confirmProposal(pool, "1003648", code(1), "tester")).toMatchObject({ ok: false });
    expect(await count("provider_codes", "provider_code = '1003648'")).toBe(0);

    const open = await pool.query<{ n: string }>("select count(*) as n from pg_stat_activity where datname = current_database() and state like 'idle in transaction%'");
    expect(Number(open.rows[0]?.n)).toBe(0);
    expect(await confirmProposal(pool, "1003648", code(5), "tester")).toMatchObject({ ok: true });
  });

  it("moves a GHN code to the unit that replaced the old one, or switches it off, keeping the old row", async () => {
    await runGhnSync(pool, client(), true);
    await confirmAllExact(pool, "province", "tester");
    await runGhnSync(pool, client(), true);
    expect(await confirmProposal(pool, "1003648", code(5), "tester")).toMatchObject({ ok: true });

    expect(await replaceMapping(pool, "1003648", code(4), "", "merged")).toMatchObject({ ok: false });
    expect(await replaceMapping(pool, "1003648", code(8), "tester", "merged")).toMatchObject({ ok: false, message: expect.stringContaining("retired") });
    expect(await replaceMapping(pool, "1003648", code(6), "tester", "merged")).toMatchObject({ ok: false, message: expect.stringContaining("another province") });
    expect(await count("provider_codes", "provider_code = '1003648' and active")).toBe(1);

    expect(await replaceMapping(pool, "1003648", code(4), "tester", "Xã Đảo merged into Beta")).toMatchObject({ ok: true });
    const rows = await pool.query("select code, active, deactivated_by, deactivated_reason from location.provider_codes where provider_code = '1003648' order by id");
    expect(rows.rows).toEqual([
      { code: code(5), active: false, deactivated_by: "tester", deactivated_reason: "Xã Đảo merged into Beta" },
      { code: code(4), active: true, deactivated_by: null, deactivated_reason: null },
    ]);

    expect(await deactivateMapping(pool, "1003648", "tester", "GHN removed the ward")).toMatchObject({ ok: true });
    expect(await deactivateMapping(pool, "1003648", "tester", "again")).toMatchObject({ ok: false });
    expect(await count("provider_codes", "provider_code = '1003648' and active")).toBe(0);
  });

  it("reports a confirmed mapping whose GHN record was renamed or switched off", async () => {
    await runGhnSync(pool, client(), true);
    await confirmAllExact(pool, "province", "tester");
    provinces = [unit(1000001, "Ví Dụ Một Mới", 1), unit(1000002, "Ví Dụ Hai", 1, 2)];
    const report = await runGhnSync(pool, client(), false);
    expect(report.changed_at_ghn).toEqual([
      { provider_code: "1000001", confirmed_name: "Ví Dụ Một", ghn_name: "Ví Dụ Một Mới", ghn_status: 1 },
      { provider_code: "1000002", confirmed_name: "Ví Dụ Hai", ghn_name: "Ví Dụ Hai", ghn_status: 2 },
    ]);
  });

  it("fails clearly when no catalog is current", async () => {
    const db = await connect();
    await clearCatalog(db);
    await db.end();
    const report = await runGhnSync(pool, client(), true);
    expect(report).toMatchObject({ status: "failed", errors: ["no current catalog; import one first"] });
  });
});
