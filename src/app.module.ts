import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { CatalogModule } from "./catalog/catalog.module";
import { DbModule } from "./db/db.module";
import { HealthController } from "./health/health.controller";
import { ReadinessService } from "./health/readiness.service";
import { ProvidersModule } from "./providers/providers.module";
import { IpRateLimitGuard } from "./rate-limit/ip-rate-limit.guard";

@Module({
  imports: [DbModule, CatalogModule, ProvidersModule],
  controllers: [HealthController],
  providers: [ReadinessService, { provide: APP_GUARD, useClass: IpRateLimitGuard }],
})
export class AppModule {}
