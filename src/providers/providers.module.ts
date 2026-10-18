import { Module } from "@nestjs/common";
import { ApiClientsRepository } from "../auth/api-clients.repository";
import { ApiKeyGuard } from "../auth/api-key.guard";
import { CatalogModule } from "../catalog/catalog.module";
import { ProvidersController } from "./providers.controller";
import { ProvidersRepository } from "./providers.repository";
import { SnapshotController } from "./snapshot.controller";

@Module({
  imports: [CatalogModule],
  controllers: [ProvidersController, SnapshotController],
  providers: [ProvidersRepository, ApiClientsRepository, ApiKeyGuard],
})
export class ProvidersModule {}
