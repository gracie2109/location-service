import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1).optional(),
  /** How often a running instance checks whether a newer catalog version was imported. */
  /** Requests per minute per IP on public routes (bursts up to twice this). */
  PUBLIC_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(100_000).default(60),
  /** Number of reverse proxies in front of the service whose X-Forwarded-For is trusted (0 = none). */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  CATALOG_REFRESH_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
});

export type Env = z.infer<typeof envSchema>;

/** Reads and validates the process environment; throws with every problem listed. */
export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment: ${problems.join("; ")}`);
  }
  return parsed.data;
};
