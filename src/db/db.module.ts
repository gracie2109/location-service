import { Global, Inject, Module, OnApplicationShutdown, Optional } from "@nestjs/common";
import { Pool } from "pg";
import { loadEnv } from "../config/env";
import { PG_POOL } from "./db.tokens";

const POOL_MAX = 5;
const CONNECT_TIMEOUT_MS = 5_000;
const QUERY_TIMEOUT_MS = 5_000;

/** The pool, or null when DATABASE_URL is not configured (the service then reports not ready). */
const createPool = (): Pool | null => {
  const { DATABASE_URL } = loadEnv();
  if (!DATABASE_URL) return null;
  return new Pool({
    connectionString: DATABASE_URL,
    max: POOL_MAX,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  });
};

@Global()
@Module({ providers: [{ provide: PG_POOL, useFactory: createPool }], exports: [PG_POOL] })
export class DbModule implements OnApplicationShutdown {
  constructor(@Optional() @Inject(PG_POOL) private readonly pool: Pool | null) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool?.end();
  }
}
