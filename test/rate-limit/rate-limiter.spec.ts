import { RateLimiter } from "../../src/rate-limit/rate-limiter";

describe("RateLimiter", () => {
  let now = 0;
  const limiter = () => new RateLimiter(() => now);

  beforeEach(() => {
    now = 1_000_000;
  });

  it("allows a burst, then refuses with a retry time", () => {
    const l = limiter();
    expect([l.hit("a", 60, 3), l.hit("a", 60, 3), l.hit("a", 60, 3)].every((v) => v.allowed)).toBe(true);
    expect(l.hit("a", 60, 3)).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it("refills over time", () => {
    const l = limiter();
    l.hit("a", 60, 1);
    expect(l.hit("a", 60, 1).allowed).toBe(false);
    now += 1_000;
    expect(l.hit("a", 60, 1).allowed).toBe(true);
  });

  it("keeps keys apart", () => {
    const l = limiter();
    l.hit("a", 1, 1);
    expect(l.hit("a", 1, 1).allowed).toBe(false);
    expect(l.hit("b", 1, 1).allowed).toBe(true);
  });

  it("never holds more than the burst", () => {
    const l = limiter();
    l.hit("a", 60, 2);
    now += 3_600_000;
    expect([l.hit("a", 60, 2), l.hit("a", 60, 2), l.hit("a", 60, 2)].map((v) => v.allowed)).toEqual([true, true, false]);
  });
});
