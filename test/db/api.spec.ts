import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.setup";
import { code, FIXTURE_SUCCESSIONS, FIXTURE_VERSION_ID, fixtureDbRows } from "../fixtures";
import { clearCatalog, connect, insertFixtureCatalog, insertFixtureUnits, migrateUp, TEST_DATABASE_URL } from "./helpers";

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describeDb("read API with a database (needs TEST_DATABASE_URL)", () => {
  let app: NestExpressApplication;
  const previous = { url: process.env.DATABASE_URL, refresh: process.env.CATALOG_REFRESH_SECONDS };

  const get = (path: string) => request(app.getHttpServer()).get(path);

  beforeAll(async () => {
    migrateUp();
    const db = await connect();
    await clearCatalog(db);
    await insertFixtureCatalog(db, FIXTURE_VERSION_ID);
    await insertFixtureUnits(db, FIXTURE_VERSION_ID, fixtureDbRows(), FIXTURE_SUCCESSIONS);
    await db.end();

    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.CATALOG_REFRESH_SECONDS = "1";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const [key, value] of [["DATABASE_URL", previous.url], ["CATALOG_REFRESH_SECONDS", previous.refresh]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const db = await connect();
    await clearCatalog(db);
    await db.end();
  });

  it("serves the API under /api/v1 and keeps probes unprefixed", async () => {
    await get("/provinces").expect(404);
    await get("/api/v1/provinces").expect(200);
    await get("/health").expect(200);
  });

  it("lists provinces with the contract fields, nulls included, and public cache headers", async () => {
    const res = await get("/api/v1/provinces").expect(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=3600, stale-while-revalidate=86400");
    expect(res.headers.etag).toBeDefined();
    expect(res.body.meta).toEqual({ catalog_version: FIXTURE_VERSION_ID, next_cursor: null, limit: null });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toEqual({
      code: code(2),
      level: "province",
      unit_type: "municipality",
      official_code: "91",
      name: "Ví Dụ Hai",
      full_name: "Thành phố Ví Dụ Hai",
      name_en: null,
      full_name_en: null,
      parent_code: null,
      status: "active",
      effective_from: "2020-01-01",
      effective_to: null,
      centroid: null,
    });
  });

  it("answers 304 when the ETag still matches", async () => {
    const first = await get("/api/v1/provinces").expect(200);
    await get("/api/v1/provinces").set("If-None-Match", first.headers.etag as string).expect(304);
  });

  it("pages communes with a cursor and stops at the end", async () => {
    const first = await get(`/api/v1/provinces/${code(1)}/communes?limit=2&sort=official_code`).expect(200);
    expect(first.body.data.map((unit: { official_code: string }) => unit.official_code)).toEqual(["90001", "90002"]);
    expect(first.body.meta.limit).toBe(2);
    const second = await get(`/api/v1/provinces/${code(1)}/communes?limit=2&sort=official_code&cursor=${first.body.meta.next_cursor as string}`).expect(200);
    expect(second.body.data.map((unit: { official_code: string }) => unit.official_code)).toEqual(["90003"]);
    expect(second.body.meta.next_cursor).toBeNull();
  });

  it("rejects bad parameters with every problem listed", async () => {
    const res = await get(`/api/v1/provinces/${code(1)}/communes?limit=0&unit_type=castle&as_of=2025-02-30`).expect(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body.code).toBe("invalid_parameter");
    expect(res.body.errors.map((e: { parameter: string }) => e.parameter).sort()).toEqual(["as_of", "limit", "unit_type"]);
    await get(`/api/v1/provinces/${code(1)}/communes?cursor=garbage`).expect(400);
  });

  it("is 404 for malformed, unknown, or wrong-level codes", async () => {
    await get("/api/v1/locations/not-a-code").expect(404);
    await get(`/api/v1/locations/${code(20)}`).expect(404);
    await get(`/api/v1/provinces/${code(3)}/communes`).expect(404);
  });

  it("gets a unit, a retired unit with its successor, and a unit as of a past date", async () => {
    const active = await get(`/api/v1/locations/${code(4)}`).expect(200);
    expect(active.body.data).toMatchObject({ code: code(4), status: "active", replaced_by: [], parent: { code: code(1), full_name: "Tỉnh Ví Dụ Một" } });

    const retired = await get(`/api/v1/locations/${code(8)}`).expect(200);
    expect(retired.body.data.status).toBe("retired");
    expect(retired.body.data.effective_to).toBe("2025-07-01");
    expect(retired.body.data.replaced_by).toEqual([
      expect.objectContaining({ code: code(4), kind: "merged_into", is_whole: true }),
    ]);

    await get(`/api/v1/locations/${code(8)}?as_of=2024-01-01`).expect(200);
    await get(`/api/v1/locations/${code(8)}?as_of=2025-07-01`).expect(404);
  });

  it("returns history with predecessors", async () => {
    const res = await get(`/api/v1/locations/${code(4)}/history`).expect(200);
    expect(res.body.data.versions).toHaveLength(1);
    expect(res.body.data.predecessors).toEqual([expect.objectContaining({ code: code(8), full_name: "Xã Cũ Một" })]);
  });

  it("searches without diacritics and rejects a short query", async () => {
    const res = await get("/api/v1/search?q=P.%20Vi%20Du%20Alpha&level=commune").expect(200);
    expect(res.body.data[0]).toMatchObject({ code: code(3), score: 1, province: { code: code(1) } });
    const bad = await get("/api/v1/search?q=a").expect(400);
    expect(bad.body.errors[0].parameter).toBe("q");
  });

  it("reports the catalog and its versions", async () => {
    const current = await get("/api/v1/catalog").expect(200);
    expect(current.body.data).toMatchObject({ id: FIXTURE_VERSION_ID, source: "fixture", is_current: true, effective_on: "2025-07-01" });
    expect(current.body.data.extracted_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const versions = await get("/api/v1/catalog/versions").expect(200);
    expect(versions.body.data.map((v: { id: string }) => v.id)).toEqual([FIXTURE_VERSION_ID]);
  });

  it("answers 409 for a cursor of an older catalog version after a newer one is imported", async () => {
    const first = await get(`/api/v1/provinces/${code(1)}/communes?limit=1`).expect(200);
    const cursor = first.body.meta.next_cursor as string;

    const db = await connect();
    await db.query("update location.catalog_versions set is_current = false");
    await db.query(
      `insert into location.catalog_versions (id, source, source_ref, effective_on, extracted_at, file_sha256, is_current)
       values ('fixture-test-2', 'fixture', 'test fixture, not real data', '2025-08-01', now(), $1, true)`,
      ["b".repeat(64)],
    );
    await db.end();
    await sleep(1_200);

    const stale = await get(`/api/v1/provinces/${code(1)}/communes?limit=1&cursor=${cursor}`).expect(409);
    expect(stale.body.code).toBe("cursor_stale");
    const fresh = await get("/api/v1/catalog").expect(200);
    expect(fresh.body.data.id).toBe("fixture-test-2");
  });
});
