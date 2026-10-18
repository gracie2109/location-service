export type Verdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type Bucket = { tokens: number; updatedAt: number };

const MAX_BUCKETS = 10_000;

/**
 * Token bucket per key, kept in this instance's memory: `perMinute` tokens refill each minute and
 * a bucket holds at most `burst`. With several instances each enforces its own limit, which is
 * enough for the abuse this service expects (see docs/kien-truc.md, section 5).
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly now: () => number = Date.now) {}

  hit(key: string, perMinute: number, burst: number): Verdict {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: burst, updatedAt: now };
    const refill = ((now - bucket.updatedAt) / 60_000) * perMinute;
    bucket.tokens = Math.min(burst, bucket.tokens + refill);
    bucket.updatedAt = now;

    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(((1 - bucket.tokens) / perMinute) * 60)) };
    }
    bucket.tokens -= 1;
    this.buckets.delete(key);
    this.buckets.set(key, bucket);
    if (this.buckets.size > MAX_BUCKETS) this.evictOldest();
    return { allowed: true };
  }

  private evictOldest(): void {
    const oldest = this.buckets.keys().next();
    if (!oldest.done) this.buckets.delete(oldest.value);
  }
}
