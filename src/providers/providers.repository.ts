import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { Pool } from "pg";
import { PG_POOL } from "../db/db.tokens";

export type ProviderCodeView = {
  code: string;
  provider: string;
  provider_model: string;
  provider_code: string;
  provider_parent_code: string | null;
  provider_name: string;
  match_method: string;
  verified_at: string;
};

const COLUMNS = `code, provider, provider_model, provider_code, provider_parent_code, provider_name, match_method,
  to_char(confirmed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as verified_at`;

@Injectable()
export class ProvidersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool | null) {}

  private requirePool(): Pool {
    if (!this.pool) throw new ServiceUnavailableException();
    return this.pool;
  }

  /** Live mappings of one unit, optionally for one provider. */
  async forUnit(code: string, provider?: string): Promise<ProviderCodeView[]> {
    const result = await this.requirePool().query<ProviderCodeView>(
      `select ${COLUMNS} from location.provider_codes
        where active and code = $1 and ($2::text is null or provider = $2)
        order by provider, provider_model`,
      [code, provider ?? null],
    );
    return result.rows;
  }

  /** The live mapping for a carrier's own code. */
  async byCarrierCode(provider: string, model: string, providerCode: string): Promise<ProviderCodeView | null> {
    const result = await this.requirePool().query<ProviderCodeView>(
      `select ${COLUMNS} from location.provider_codes
        where active and provider = $1 and provider_model = $2 and provider_code = $3`,
      [provider, model, providerCode],
    );
    return result.rows[0] ?? null;
  }

  /** Every live mapping, for the snapshot export. */
  async allLive(provider?: string): Promise<ProviderCodeView[]> {
    const result = await this.requirePool().query<ProviderCodeView>(
      `select ${COLUMNS} from location.provider_codes
        where active and ($1::text is null or provider = $1)
        order by provider, provider_model, provider_code`,
      [provider ?? null],
    );
    return result.rows;
  }
}
