import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { Pool } from "pg";
import { PG_POOL } from "../db/db.tokens";

export type ApiClient = {
  id: number;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  rateLimitPerMin: number;
};

type Row = { id: string; name: string; key_prefix: string; key_hash: string; scopes: string[]; rate_limit_per_min: number };

const toClient = (row: Row): ApiClient => ({
  id: Number(row.id),
  name: row.name,
  keyPrefix: row.key_prefix,
  keyHash: row.key_hash,
  scopes: row.scopes,
  rateLimitPerMin: row.rate_limit_per_min,
});

@Injectable()
export class ApiClientsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool | null) {}

  private requirePool(): Pool {
    if (!this.pool) throw new ServiceUnavailableException();
    return this.pool;
  }

  /** The live (not revoked) client with this key prefix. */
  async findActiveByPrefix(prefix: string): Promise<ApiClient | null> {
    const result = await this.requirePool().query<Row>(
      "select id, name, key_prefix, key_hash, scopes, rate_limit_per_min from location.api_clients where key_prefix = $1 and revoked_at is null",
      [prefix],
    );
    return result.rows[0] ? toClient(result.rows[0]) : null;
  }
}
