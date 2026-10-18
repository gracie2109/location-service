import { Module } from "@nestjs/common";
import { CatalogCacheService } from "./catalog-cache.service";
import { CatalogController } from "./catalog.controller";
import { CatalogRepository } from "./catalog.repository";

@Module({
  controllers: [CatalogController],
  providers: [CatalogRepository, CatalogCacheService],
  exports: [CatalogCacheService],
})
export class CatalogModule {}
