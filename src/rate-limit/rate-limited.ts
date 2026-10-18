import { ExecutionContext, HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";

/** Sets `Retry-After` and throws the 429 the problem filter turns into `rate_limited`. */
export const rateLimited = (context: ExecutionContext, retryAfterSeconds: number): never => {
  context.switchToHttp().getResponse<Response>().setHeader("Retry-After", String(retryAfterSeconds));
  throw new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS);
};
