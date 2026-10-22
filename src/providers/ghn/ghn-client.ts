import { z } from "zod";
import type { GhnUnit } from "./types";

const PAGE_LIMIT = 200;
const RETRIES = 3;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRY_AFTER_MS = 30_000;

const unitSchema = z.object({
  _id: z.number().int(),
  name: z.string().min(1),
  extension_names: z.array(z.string()).default([]),
  status: z.number().int(),
  parent_id: z.number().int(),
});
const responseSchema = z.object({ code: z.number(), data: z.array(unitSchema).nullable() });

export class GhnError extends Error {}

/** A failure worth another attempt; `retryAfterMs` is what GHN asked for with Retry-After, if anything. */
class RetryableError extends Error {
  constructor(message: string, readonly retryAfterMs?: number) {
    super(message);
  }
}

const retryAfterMs = (response: Response): number | undefined => {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : undefined;
};

const isTimeout = (error: unknown): boolean => error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");

const reasonSchema = z.object({ code_message_value: z.string().optional(), message: z.string().optional() });

/** GHN's own explanation of a 4xx, shortened; it describes the request, never contains the token. */
const rejectionReason = async (response: Response): Promise<string> => {
  const parsed = reasonSchema.safeParse(await response.json().catch(() => null));
  const reason = parsed.success ? (parsed.data.code_message_value ?? parsed.data.message) : undefined;
  return reason ? `: ${reason.slice(0, 200)}` : "";
};

export type GhnConfig = { token: string; shopId: string; baseUrl: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read-only client for GHN's two-level master data. Only GET requests are made. Errors never contain
 * the token; for a 4xx they carry GHN's short explanation of the rejection.
 */
export class GhnClient {
  constructor(
    private readonly config: GhnConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly pauseMs = 500,
    private readonly timeoutMs = REQUEST_TIMEOUT_MS,
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
        const response = await this.fetchImpl(url, { method: "GET", headers: { Token: this.config.token, ShopId: this.config.shopId }, signal: AbortSignal.timeout(this.timeoutMs) });
        if (response.status === 401) throw new GhnError("GHN refused the token or IP (401); check GHN_TOKEN, GHN_SHOP_ID and any IP allow-list");
        if (response.status === 429 || response.status >= 500) throw new RetryableError(`GHN answered ${response.status}`, retryAfterMs(response));
        if (!response.ok) throw new GhnError(`GHN answered ${response.status}${await rejectionReason(response)}`);
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
        const retryable = error instanceof RetryableError || error instanceof TypeError || isTimeout(error);
        if (!retryable || attempt >= RETRIES) {
          throw retryable ? new GhnError(`GHN request failed after ${attempt} attempts`) : error;
        }
        const asked = error instanceof RetryableError ? error.retryAfterMs : undefined;
        await sleep(asked ?? this.pauseMs * 2 ** attempt * (0.5 + Math.random()));
      }
    }
  }
}
