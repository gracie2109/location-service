import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { InvalidParameterException } from "./exceptions";
import { problemForStatus } from "./problem";

/** Turns every error into an `application/problem+json` response; internals are never exposed. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500 && !(exception instanceof HttpException)) {
      this.logger.error(`${request.method} ${request.path} failed`, exception instanceof Error ? exception.stack : undefined);
    }

    const body = problemForStatus(status, request.path);
    if (exception instanceof InvalidParameterException) body.errors = exception.errors;
    response.status(status).type("application/problem+json").json(body);
  }
}
