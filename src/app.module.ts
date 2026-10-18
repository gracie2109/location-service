import { Module } from "@nestjs/common";
import { CatalogModule } from "./catalog/catalog.module";
import { DbModule } from "./db/db.module";
import { HealthController } from "./health/health.controller";
import { ReadinessService } from "./health/readiness.service";

@Module({
  imports: [DbModule, CatalogModule],
  controllers: [HealthController],
  providers: [ReadinessService],
})
export class AppModule {}
