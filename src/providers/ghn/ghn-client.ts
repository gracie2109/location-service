import { z } from "zod";
import type { GhnUnit } from "./types";

const PAGE_LIMIT = 200;
const RETRIES = 3;

const unitSchema = z.object({
  _id: z.number().int(),
  name: z.string().min(1),
  extension_names: z.array(z.string()).default([]),
  status: z.number().int(),
  parent_id: z.number().int(),
});
const responseSchema = z.object({ code: z.number(), data: z.array(unitSchema).nullable() });

export class GhnError extends Error {}

export type GhnConfig = { token: string; shopId: string; baseUrl: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read-only client for GHN's two-level master data. Only GET requests are made. Errors never contain
 * the token or the response body.
 */
export class GhnClient {
  constructor(
    private readonly config: GhnConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly pauseMs = 500,
  ) {}

  async provinces(): Promise<GhnUnit[]> {
    return this.getAll("/shiip/public-api/v3/master-data/province/all", {});
  }

  /** GHN answers 200 with `data: null` for an unknown province id; that is reported as an error. */
  async wards(provinceId: number): Promise<GhnUnit[]> {
    const wards = await this.getAll("/shiip/public-api/v3/master-data/ward/all-by-province-id", { province_id: String(provinceId) });
    if (wards.length === 0) throw new GhnError(`GHN returned no wards for province ${provinceId}`);
    return wards;
  }

  private async getAll(path: string, params: Record<string, string>): Promise<GhnUnit[]> {
    const all: GhnUnit[] = [];
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const page = await this.getPage(path, { ...params, offset: String(offset), limit: String(PAGE_LIMIT) });
      all.push(...page);
      if (page.length < PAGE_LIMIT) return all;
      await sleep(this.pauseMs);
    }
  }

  private async getPage(path: string, params: Record<string, string>): Promise<GhnUnit[]> {
    const url = `${this.config.baseUrl}${path}?${new URLSearchParams(params).toString()}`;
    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, { method: "GET", headers: { Token: this.config.token, ShopId: this.config.shopId } });
        if (response.status === 401) throw new GhnError("GHN refused the token or IP (401); check GHN_TOKEN, GHN_SHOP_ID and any IP allow-list");
        if (response.status === 429 || response.status >= 500) throw new RetryableError(`GHN answered ${response.status}`);
        if (!response.ok) throw new GhnError(`GHN answered ${response.status}`);
        const parsed = responseSchema.safeParse(await response.json().catch(() => null));
        if (!parsed.success) throw new GhnError("GHN response does not have the documented shape");
        return (parsed.data.data ?? []).map((item) => ({
          id: item._id,
          name: item.name,
          extensionNames: item.extension_names,
          status: item.status,
          parentId: item.parent_id,
        }));
      } catch (error) {
        const retryable = error instanceof RetryableError || error instanceof TypeError;
        if (!retryable || attempt >= RETRIES) {
          throw error instanceof RetryableError || error instanceof TypeError ? new GhnError(`GHN request failed after ${attempt} attempts`) : error;
        }
        await sleep(this.pauseMs * 2 ** attempt);
      }
    }
  }
}

class RetryableError extends Error {}
