import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.setup";
import { clearCatalog, connect, insertFixtureCatalog, migrateUp, TEST_DATABASE_URL } from "./helpers";

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb("GET /ready with a database (needs TEST_DATABASE_URL)", () => {
  let app: NestExpressApplication;
  const previousUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    migrateUp();
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
    await db.end();
  });

  it("is 503 while no catalog is current", async () => {
    const db = await connect();
    await clearCatalog(db);
    await db.end();
    const res = await request(app.getHttpServer()).get("/ready").expect(503);
    expect(res.body.code).toBe("catalog_unavailable");
  });

  it("is 200 with the catalog version once one is current", async () => {
    const db = await connect();
    await clearCatalog(db);
    await insertFixtureCatalog(db, "fixture-ready-1");
    await db.end();
    const res = await request(app.getHttpServer()).get("/ready").expect(200);
    expect(res.body).toEqual({ status: "ready", catalog_version: "fixture-ready-1" });
  });
});
