import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ReadinessService } from "./readiness.service";

@Controller()
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get("health")
  health() {
    return { status: "ok" };
  }

  /** Ready once the database answers and a current catalog version exists. */
  @Get("ready")
  async ready() {
    const catalogVersion = await this.readiness.currentCatalogVersion();
    if (!catalogVersion) throw new ServiceUnavailableException();
    return { status: "ready", catalog_version: catalogVersion };
  }
}
