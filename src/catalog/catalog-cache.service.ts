import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { loadEnv } from "../config/env";
import { CatalogRepository } from "./catalog.repository";
import type { Snapshot } from "./types";

/**
 * Keeps the current catalog in memory. At most once per refresh interval a request checks which version
 * is current; a different version is reloaded, the same one is kept. If the database fails after a
 * snapshot was loaded, the old snapshot keeps being served.
 */
@Injectable()
export class CatalogCacheService {
  private readonly logger = new Logger(CatalogCacheService.name);
  private readonly refreshMs = loadEnv().CATALOG_REFRESH_SECONDS * 1000;
  private snapshot: Snapshot | null = null;
  private checkedAt = 0;
  private inFlight: Promise<Snapshot> | null = null;

  constructor(private readonly repository: CatalogRepository) {}

  async get(): Promise<Snapshot> {
    if (this.snapshot && Date.now() - this.checkedAt < this.refreshMs) return this.snapshot;
    this.inFlight ??= this.refresh().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async refresh(): Promise<Snapshot> {
    try {
      const currentId = await this.repository.currentVersionId();
      if (this.snapshot && currentId === this.snapshot.catalog.id) {
        this.checkedAt = Date.now();
        return this.snapshot;
      }
      const loaded = await this.repository.loadSnapshot();
      if (!loaded) throw new ServiceUnavailableException();
      this.snapshot = loaded;
      this.checkedAt = Date.now();
      return loaded;
    } catch (error) {
      if (this.snapshot && !(error instanceof ServiceUnavailableException)) {
        this.logger.warn(`catalog refresh failed, serving version ${this.snapshot.catalog.id}: ${error instanceof Error ? error.message : "unknown error"}`);
        this.checkedAt = Date.now();
        return this.snapshot;
      }
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.warn(`catalog load failed: ${error instanceof Error ? error.message : "unknown error"}`);
      throw new ServiceUnavailableException();
    }
  }
}
