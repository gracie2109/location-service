import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.setup";
import { generateApiKey, type Scope } from "../../src/auth/api-key";
import { code, FIXTURE_SUCCESSIONS, FIXTURE_VERSION_ID, fixtureDbRows } from "../fixtures";
import { clearCatalog, connect, insertFixtureCatalog, insertFixtureUnits, migrateUp, TEST_DATABASE_URL } from "./helpers";

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb("provider codes, snapshot and API keys (needs TEST_DATABASE_URL)", () => {
  let app: NestExpressApplication;
  const previousUrl = process.env.DATABASE_URL;
  let readKey: string;
  let snapshotKey: string;
  let bothKey: string;

  const addClient = async (name: string, scopes: Scope[], rate = 120): Promise<string> => {
    const { key, prefix, hash } = generateApiKey();
    const db = await connect();
    await db.query("insert into location.api_clients (name, key_prefix, key_hash, scopes, rate_limit_per_min) values ($1, $2, $3, $4, $5)", [name, prefix, hash, scopes, rate]);
    await db.end();
    return key;
  };

  const get = (path: string, key?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return key ? req.set("Authorization", `Bearer ${key}`) : req;
  };

  beforeAll(async () => {
    migrateUp();
    const db = await connect();
    await clearCatalog(db);
    await db.query("truncate location.api_clients restart identity");
    await insertFixtureCatalog(db, FIXTURE_VERSION_ID);
    await insertFixtureUnits(db, FIXTURE_VERSION_ID, fixtureDbRows(), FIXTURE_SUCCESSIONS);
    await db.query(
      `insert into location.provider_codes (code, provider, provider_model, provider_code, provider_parent_code, provider_name, match_method, confirmed_by)
       values ($1, 'ghn', 'ghn_v2', '1000001', null, 'Ví Dụ Một', 'confirmed', 'test'),
              ($2, 'ghn', 'ghn_v2', '1003646', '1000001', 'Phường Ví Dụ Alpha', 'confirmed', 'test')`,
      [code(1), code(3)],
    );
    await db.end();
    readKey = await addClient("reader", ["provider-codes:read"]);
    snapshotKey = await addClient("snapshotter", ["catalog:snapshot"]);
    bothKey = await addClient("both", ["catalog:snapshot", "provider-codes:read"]);

    process.env.DATABASE_URL = TEST_DATABASE_URL;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    const db = await connect();
    await clearCatalog(db);
    await db.query("truncate location.api_clients restart identity");
    await db.end();
  });

  it("answers 401 without a key, with a malformed key, and with a wrong secret", async () => {
    await get(`/api/v1/locations/${code(3)}/provider-codes`).expect(401);
    await get(`/api/v1/locations/${code(3)}/provider-codes`, "nonsense").expect(401);
    const wrong = readKey.slice(0, -4) + (readKey.endsWith("0000") ? "1111" : "0000");
    const res = await get(`/api/v1/locations/${code(3)}/provider-codes`, wrong).expect(401);
    expect(res.body.code).toBe("unauthorized");
  });

  it("answers 403 when the key lacks the scope", async () => {
    const res = await get(`/api/v1/locations/${code(3)}/provider-codes`, snapshotKey).expect(403);
    expect(res.body.code).toBe("forbidden");
  });

  it("lists the mappings of a unit, uncached", async () => {
    const res = await get(`/api/v1/locations/${code(3)}/provider-codes?provider=ghn`, readKey).expect(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body.data).toEqual([
      expect.objectContaining({ code: code(3), provider: "ghn", provider_model: "ghn_v2", provider_code: "1003646", provider_parent_code: "1000001", provider_name: "Phường Ví Dụ Alpha", match_method: "confirmed" }),
    ]);
    expect(res.body.data[0].verified_at).toMatch(/Z$/);
    const unmapped = await get(`/api/v1/locations/${code(4)}/provider-codes`, readKey).expect(200);
    expect(unmapped.body.data).toEqual([]);
    await get(`/api/v1/locations/${code(20)}/provider-codes`, readKey).expect(404);
  });

  it("finds the unit for a carrier code, and needs the model", async () => {
    const res = await get("/api/v1/provider-codes/ghn/1003646?provider_model=ghn_v2", readKey).expect(200);
    expect(res.body.data.location).toMatchObject({ code: code(3), full_name: "Phường Ví Dụ Alpha" });
    expect(res.body.data.mapping.provider_code).toBe("1003646");
    await get("/api/v1/provider-codes/ghn/1003646", readKey).expect(400);
    await get("/api/v1/provider-codes/ghn/9999999?provider_model=ghn_v2", readKey).expect(404);
    await get("/api/v1/provider-codes/other/1?provider_model=ghn_v2", readKey).expect(404);
  });

  it("exports the catalog as NDJSON and adds provider codes only with the second scope", async () => {
    const res = await get("/api/v1/catalog/snapshot", snapshotKey).expect(200);
    expect(res.headers["content-type"]).toContain("application/x-ndjson");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    const lines = res.text.trim().split("\n").map((line) => JSON.parse(line) as { type: string });
    expect(lines[0]).toMatchObject({ type: "catalog", id: FIXTURE_VERSION_ID });
    expect(lines.filter((line) => line.type === "location")).toHaveLength(8);
    expect(lines.filter((line) => line.type === "succession")).toHaveLength(1);
    expect(lines.some((line) => line.type === "provider_code")).toBe(false);

    await get("/api/v1/catalog/snapshot?providers=ghn", snapshotKey).expect(403);
    const full = await get("/api/v1/catalog/snapshot?providers=ghn", bothKey).expect(200);
    expect(full.text.trim().split("\n").filter((line) => line.includes('"type":"provider_code"'))).toHaveLength(2);
    await get("/api/v1/catalog/snapshot?version=nope", bothKey).expect(404);
  });

  it("stops a revoked key", async () => {
    const key = await addClient("short-lived", ["provider-codes:read"]);
    await get(`/api/v1/locations/${code(3)}/provider-codes`, key).expect(200);
    const db = await connect();
    await db.query("update location.api_clients set revoked_at = now() where name = 'short-lived'");
    await db.end();
    await get(`/api/v1/locations/${code(3)}/provider-codes`, key).expect(401);
  });

  it("limits a client to its own rate and tells it when to retry", async () => {
    const key = await addClient("slow", ["provider-codes:read"], 2);
    await get(`/api/v1/locations/${code(3)}/provider-codes`, key).expect(200);
    await get(`/api/v1/locations/${code(3)}/provider-codes`, key).expect(200);
    const res = await get(`/api/v1/locations/${code(3)}/provider-codes`, key).expect(429);
    expect(res.body.code).toBe("rate_limited");
    expect(Number(res.headers["retry-after"])).toBeGreaterThanOrEqual(1);
  });

  it("enforces the schema's one-live-mapping rules", async () => {
    const db = await connect();
    await expect(
      db.query(
        `insert into location.provider_codes (code, provider, provider_model, provider_code, provider_name, match_method, confirmed_by)
         values ($1, 'ghn', 'ghn_v2', '1003646', 'dup', 'confirmed', 'test')`,
        [code(4)],
      ),
    ).rejects.toThrow(/provider_codes_carrier_live/);
    await expect(
      db.query(
        `insert into location.provider_codes (code, provider, provider_model, provider_code, provider_name, match_method, confirmed_by)
         values ($1, 'ghn', 'ghn_v2', '5', 'dup', 'confirmed', 'test')`,
        [code(3)],
      ),
    ).rejects.toThrow(/provider_codes_unit_live/);
    await db.end();
  });
});

describeDb("public rate limit (needs TEST_DATABASE_URL)", () => {
  it("answers 429 after the burst for one IP, but never for probes", async () => {
    const previous = { limit: process.env.PUBLIC_RATE_LIMIT_PER_MIN, url: process.env.DATABASE_URL };
    process.env.PUBLIC_RATE_LIMIT_PER_MIN = "1";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    try {
      const results: number[] = [];
      for (let i = 0; i < 4; i += 1) results.push((await request(app.getHttpServer()).get("/api/v1/provinces")).status);
      expect(results.filter((status) => status === 429).length).toBeGreaterThanOrEqual(1);
      for (let i = 0; i < 5; i += 1) await request(app.getHttpServer()).get("/health").expect(200);
    } finally {
      await app.close();
      if (previous.limit === undefined) delete process.env.PUBLIC_RATE_LIMIT_PER_MIN;
      else process.env.PUBLIC_RATE_LIMIT_PER_MIN = previous.limit;
    }
  });
});
