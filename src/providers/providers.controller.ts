import { Controller, Get, Header, NotFoundException, Param, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { RequireScope } from "../auth/require-scope.decorator";
import { ApiKeyGuard } from "../auth/api-key.guard";
import { CatalogCacheService } from "../catalog/catalog-cache.service";
import { versionToShow } from "../catalog/as-of";
import { parseQuery, isLocationCode } from "../catalog/params";
import { toLocationView } from "../catalog/views";
import { ProvidersRepository } from "./providers.repository";

const NO_STORE = "private, no-store";
const PROVIDERS = ["ghn"] as const;
const MODELS = ["ghn_v2"] as const;

const forUnitQuery = z.object({ provider: z.enum(PROVIDERS).optional() });
const lookupQuery = z.object({ provider_model: z.enum(MODELS) });

@Controller()
@UseGuards(ApiKeyGuard)
export class ProvidersController {
  constructor(
    private readonly cache: CatalogCacheService,
    private readonly providers: ProvidersRepository,
  ) {}

  @Get("locations/:code/provider-codes")
  @RequireScope("provider-codes:read")
  @Header("Cache-Control", NO_STORE)
  async forUnit(@Param("code") code: string, @Query() query: unknown) {
    const { provider } = parseQuery(forUnitQuery, query);
    const snapshot = await this.cache.get();
    if (!isLocationCode(code) || !snapshot.byCode.has(code)) throw new NotFoundException();
    return { data: await this.providers.forUnit(code, provider), meta: { catalog_version: snapshot.catalog.id } };
  }

  @Get("provider-codes/:provider/:providerCode")
  @RequireScope("provider-codes:read")
  @Header("Cache-Control", NO_STORE)
  async lookup(@Param("provider") provider: string, @Param("providerCode") providerCode: string, @Query() query: unknown) {
    const { provider_model } = parseQuery(lookupQuery, query);
    if (!(PROVIDERS as readonly string[]).includes(provider) || providerCode.length > 40) throw new NotFoundException();

    const snapshot = await this.cache.get();
    const mapping = await this.providers.byCarrierCode(provider, provider_model, providerCode);
    const version = mapping ? versionToShow(snapshot.byCode.get(mapping.code) ?? []) : undefined;
    if (!mapping || !version) throw new NotFoundException();
    return { data: { mapping, location: toLocationView(snapshot, version) }, meta: { catalog_version: snapshot.catalog.id } };
  }
}
