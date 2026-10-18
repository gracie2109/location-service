import { Controller, Get, Header, NotFoundException, Param, Query } from "@nestjs/common";
import { CatalogCacheService } from "./catalog-cache.service";
import { offsetFromCursor, paginate } from "./cursor";
import { versionOn, versionToShow } from "./as-of";
import { isLocationCode, communesQuery, locationQuery, parseQuery, provincesQuery, searchQuery } from "./params";
import { listCommunes, listProvinces, searchUnits } from "./queries";
import type { Snapshot, UnitVersion } from "./types";
import { provinceOf, toCatalogView, toDetailView, toHistoryView, toLocationView, toRefView } from "./views";

const PUBLIC_CACHE = "public, max-age=3600, stale-while-revalidate=86400";

/** The unit's versions; an unknown or malformed code is a 404. */
const requireUnit = (snapshot: Snapshot, code: string): UnitVersion[] => {
  const versions = isLocationCode(code) ? snapshot.byCode.get(code) : undefined;
  if (!versions) throw new NotFoundException();
  return versions;
};

@Controller()
export class CatalogController {
  constructor(private readonly cache: CatalogCacheService) {}

  @Get("provinces")
  @Header("Cache-Control", PUBLIC_CACHE)
  async provinces(@Query() query: unknown) {
    const { as_of, sort } = parseQuery(provincesQuery, query);
    const snapshot = await this.cache.get();
    const data = listProvinces(snapshot, as_of, sort).map((version) => toLocationView(snapshot, version));
    return { data, meta: { catalog_version: snapshot.catalog.id, next_cursor: null, limit: null } };
  }

  @Get("provinces/:code/communes")
  @Header("Cache-Control", PUBLIC_CACHE)
  async communes(@Param("code") code: string, @Query() query: unknown) {
    const params = parseQuery(communesQuery, query);
    const snapshot = await this.cache.get();
    const province = requireUnit(snapshot, code)[0];
    if (province?.level !== "province") throw new NotFoundException();

    const offset = offsetFromCursor(params.cursor, snapshot.catalog.id);
    const all = listCommunes(snapshot, code, { asOf: params.as_of, q: params.q, unitTypes: params.unit_type, sort: params.sort });
    const page = paginate(all, offset, params.limit, snapshot.catalog.id);
    return {
      data: page.items.map((version) => toLocationView(snapshot, version)),
      meta: { catalog_version: snapshot.catalog.id, next_cursor: page.nextCursor, limit: params.limit },
    };
  }

  @Get("locations/:code")
  @Header("Cache-Control", PUBLIC_CACHE)
  async location(@Param("code") code: string, @Query() query: unknown) {
    const { as_of } = parseQuery(locationQuery, query);
    const snapshot = await this.cache.get();
    const versions = requireUnit(snapshot, code);
    const version = as_of ? versionOn(versions, as_of) : versionToShow(versions);
    if (!version) throw new NotFoundException();
    return { data: toDetailView(snapshot, version, as_of), meta: { catalog_version: snapshot.catalog.id } };
  }

  @Get("locations/:code/history")
  @Header("Cache-Control", PUBLIC_CACHE)
  async history(@Param("code") code: string) {
    const snapshot = await this.cache.get();
    const versions = requireUnit(snapshot, code);
    return { data: toHistoryView(snapshot, code, versions), meta: { catalog_version: snapshot.catalog.id } };
  }

  @Get("search")
  @Header("Cache-Control", PUBLIC_CACHE)
  async search(@Query() query: unknown) {
    const params = parseQuery(searchQuery, query);
    const snapshot = await this.cache.get();
    const offset = offsetFromCursor(params.cursor, snapshot.catalog.id);
    if (params.province) {
      const province = requireUnit(snapshot, params.province)[0];
      if (province?.level !== "province") throw new NotFoundException();
    }
    const matches = searchUnits(snapshot, {
      q: params.q,
      levels: params.level,
      provinceCode: params.province,
      includeRetired: params.include_retired,
    });
    const page = paginate(matches, offset, params.limit, snapshot.catalog.id);
    const data = page.items.map(({ version, score }) => {
      const province = provinceOf(snapshot, version);
      return { ...toLocationView(snapshot, version), province: province ? toRefView(province) : null, score };
    });
    return { data, meta: { catalog_version: snapshot.catalog.id, next_cursor: page.nextCursor, limit: params.limit } };
  }

  @Get("catalog")
  @Header("Cache-Control", PUBLIC_CACHE)
  async current() {
    const snapshot = await this.cache.get();
    return { data: toCatalogView(snapshot.catalog) };
  }

  @Get("catalog/versions")
  async versions() {
    const snapshot = await this.cache.get();
    return { data: snapshot.versions.map(toCatalogView) };
  }
}
