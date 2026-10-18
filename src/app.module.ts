import { Module } from "@nestjs/common";
import { DbModule } from "./db/db.module";
import { HealthController } from "./health/health.controller";
import { ReadinessService } from "./health/readiness.service";

@Module({
  imports: [DbModule],
  controllers: [HealthController],
  providers: [ReadinessService],
})
export class AppModule {}
