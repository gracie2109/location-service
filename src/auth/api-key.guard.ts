import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { RateLimiter } from "../rate-limit/rate-limiter";
import { ApiClientsRepository, type ApiClient } from "./api-clients.repository";
import { parseApiKey, secretMatches } from "./api-key";
import { SCOPE_METADATA } from "./require-scope.decorator";
import { rateLimited } from "../rate-limit/rate-limited";

export type AuthenticatedRequest = Request & { apiClient?: ApiClient };

const bearerToken = (header: string | undefined): string | null => {
  const match = /^Bearer (\S+)$/.exec(header ?? "");
  return match?.[1] ?? null;
};

/**
 * Authenticates `Authorization: Bearer lsk_<prefix>_<secret>` and checks the route's scopes.
 * Unknown, malformed and revoked keys all answer the same 401 so keys cannot be probed.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  /** One bucket per client; the limit is the client's own `rate_limit_per_min`. */
  private readonly limiter = new RateLimiter();

  constructor(
    private readonly reflector: Reflector,
    private readonly clients: ApiClientsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const parsed = parseApiKey(bearerToken(request.headers.authorization) ?? "");
    if (!parsed) throw new UnauthorizedException();

    const client = await this.clients.findActiveByPrefix(parsed.prefix);
    if (!client || !secretMatches(parsed.secret, client.keyHash)) throw new UnauthorizedException();

    const needed = this.reflector.get<string[] | undefined>(SCOPE_METADATA, context.getHandler()) ?? [];
    if (!needed.every((scope) => client.scopes.includes(scope))) throw new ForbiddenException();

    const verdict = this.limiter.hit(`client:${client.id}`, client.rateLimitPerMin, client.rateLimitPerMin);
    if (!verdict.allowed) rateLimited(context, verdict.retryAfterSeconds);

    request.apiClient = client;
    return true;
  }
}
