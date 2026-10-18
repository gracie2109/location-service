import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Pool } from "pg";
import { PG_POOL } from "../db/db.tokens";

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool | null) {}

  /** The id of the current catalog version, or null when the service cannot answer from a catalog. */
  async currentCatalogVersion(): Promise<string | null> {
    if (!this.pool) return null;
    try {
      const result = await this.pool.query<{ id: string }>("select id from location.catalog_versions where is_current");
      return result.rows[0]?.id ?? null;
    } catch (error) {
      this.logger.warn(`readiness check failed: ${error instanceof Error ? error.message : "unknown error"}`);
      return null;
    }
  }
}
