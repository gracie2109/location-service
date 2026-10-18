import { Controller, ForbiddenException, Get, NotFoundException, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { RequireScope } from "../auth/require-scope.decorator";
import { ApiKeyGuard, type AuthenticatedRequest } from "../auth/api-key.guard";
import { CatalogCacheService } from "../catalog/catalog-cache.service";
import { versionToShow } from "../catalog/as-of";
import { parseQuery } from "../catalog/params";
import { toCatalogView, toLocationView } from "../catalog/views";
import { ProvidersRepository } from "./providers.repository";

const snapshotQuery = z.object({
  version: z.string().min(1).max(64).optional(),
  providers: z.string().transform((text) => text.split(",").map((part) => part.trim()).filter(Boolean)).pipe(z.array(z.enum(["ghn"])).min(1)).optional(),
});

const ndjson = (rows: object[]): string => rows.map((row) => JSON.stringify(row)).join("\n") + "\n";

@Controller()
@UseGuards(ApiKeyGuard)
export class SnapshotController {
  constructor(
    private readonly cache: CatalogCacheService,
    private readonly providers: ProvidersRepository,
  ) {}

  /** The whole current catalog as NDJSON: catalog line, locations, successions, then optional provider codes. */
  @Get("catalog/snapshot")
  @RequireScope("catalog:snapshot")
  async snapshot(@Query() query: unknown, @Req() request: AuthenticatedRequest, @Res() response: Response): Promise<void> {
    const params = parseQuery(snapshotQuery, query);
    if (params.providers && !request.apiClient?.scopes.includes("provider-codes:read")) throw new ForbiddenException();

    const snapshot = await this.cache.get();
    if (params.version && params.version !== snapshot.catalog.id) throw new NotFoundException();

    const lines: object[] = [{ type: "catalog", ...toCatalogView(snapshot.catalog) }];
    for (const versions of snapshot.byCode.values()) {
      const version = versionToShow(versions);
      if (version) lines.push({ type: "location", ...toLocationView(snapshot, version) });
    }
    for (const list of snapshot.successionsFrom.values()) {
      for (const s of list) {
        lines.push({
          type: "succession",
          from_code: s.fromCode,
          to_code: s.toCode,
          kind: s.kind,
          is_whole: s.isWhole,
          basis: s.basis,
          effective_on: s.effectiveOn,
        });
      }
    }
    for (const provider of params.providers ?? []) {
      for (const row of await this.providers.allLive(provider)) lines.push({ type: "provider_code", ...row });
    }

    response.setHeader("Cache-Control", "private, no-store");
    response.type("application/x-ndjson").send(ndjson(lines));
  }
}
