import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { loadEnv } from "../config/env";
import { RateLimiter } from "./rate-limiter";
import { rateLimited } from "./rate-limited";

/** Per-IP limit on every route except the probes; applied app-wide. */
@Injectable()
export class IpRateLimitGuard implements CanActivate {
  private readonly limiter = new RateLimiter();
  private readonly perMinute = loadEnv().PUBLIC_RATE_LIMIT_PER_MIN;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path === "/health" || request.path === "/ready") return true;
    const verdict = this.limiter.hit(`ip:${request.ip ?? "unknown"}`, this.perMinute, this.perMinute * 2);
    if (!verdict.allowed) rateLimited(context, verdict.retryAfterSeconds);
    return true;
  }
}
