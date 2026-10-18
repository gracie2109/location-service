import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get("health")
  health() {
    return { status: "ok" };
  }

  /** Not ready until a catalog is loaded (added with the database in S2/S3). */
  @Get("ready")
  ready() {
    throw new ServiceUnavailableException();
  }
}
