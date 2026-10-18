import type { Pool } from "pg";
import { ReadinessService } from "./readiness.service";

const poolReturning = (query: jest.Mock) => ({ query }) as unknown as Pool;

describe("ReadinessService", () => {
  it("is null without a pool", async () => {
    expect(await new ReadinessService(null).currentCatalogVersion()).toBeNull();
  });

  it("returns the current catalog id", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: "c1" }] });
    expect(await new ReadinessService(poolReturning(query)).currentCatalogVersion()).toBe("c1");
  });

  it("is null when no catalog is current", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    expect(await new ReadinessService(poolReturning(query)).currentCatalogVersion()).toBeNull();
  });

  it("is null when the database fails", async () => {
    const query = jest.fn().mockRejectedValue(new Error("connection refused"));
    expect(await new ReadinessService(poolReturning(query)).currentCatalogVersion()).toBeNull();
  });
});
