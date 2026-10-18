import { HttpException, HttpStatus } from "@nestjs/common";

export type ParameterError = { parameter: string; message: string };

/** 400 with one entry per offending parameter (contract: Problem.errors). */
export class InvalidParameterException extends HttpException {
  constructor(readonly errors: ParameterError[]) {
    super("Invalid parameter", HttpStatus.BAD_REQUEST);
  }
}

/** 409: the cursor was issued for another catalog version, so paging must restart. */
export class CursorStaleException extends HttpException {
  constructor() {
    super("Cursor is stale", HttpStatus.CONFLICT);
  }
}
