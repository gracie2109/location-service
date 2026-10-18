import { problemForStatus } from "./problem";

describe("problemForStatus", () => {
  it.each([
    [400, "invalid_parameter"],
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [409, "cursor_stale"],
    [429, "rate_limited"],
    [503, "catalog_unavailable"],
  ])("maps %i to %s", (status, code) => {
    expect(problemForStatus(status)).toMatchObject({ status, code });
  });

  it("hides unknown statuses behind internal", () => {
    expect(problemForStatus(418)).toMatchObject({ status: 500, code: "internal" });
  });

  it("includes the request path as instance", () => {
    expect(problemForStatus(404, "/x").instance).toBe("/x");
  });
});
