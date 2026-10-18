import { loadEnv } from "./env";

describe("loadEnv", () => {
  it("applies defaults", () => {
    expect(loadEnv({})).toEqual({ NODE_ENV: "development", PORT: 3000, CATALOG_REFRESH_SECONDS: 60 });
  });

  it("coerces PORT", () => {
    expect(loadEnv({ PORT: "8080" }).PORT).toBe(8080);
  });

  it("lists every invalid variable", () => {
    expect(() => loadEnv({ NODE_ENV: "staging", PORT: "0" })).toThrow(/NODE_ENV.*PORT|PORT.*NODE_ENV/);
  });
});
