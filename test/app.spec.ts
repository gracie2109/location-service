import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";

describe("app", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health is ok", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /ready is 503 problem+json until a catalog is loaded", async () => {
    const res = await request(app.getHttpServer()).get("/ready").expect(503);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).toMatchObject({ status: 503, code: "catalog_unavailable", instance: "/ready" });
  });

  it("does not advertise the framework", async () => {
    const res = await request(app.getHttpServer()).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("unknown route is a not_found problem", async () => {
    const res = await request(app.getHttpServer()).get("/nope").expect(404);
    expect(res.body).toMatchObject({ status: 404, code: "not_found" });
  });
});
