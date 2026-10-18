import type { NestExpressApplication } from "@nestjs/platform-express";
import { ProblemFilter } from "./common/problem.filter";

/** Shared by main.ts and the tests so both run the same app. */
export const configureApp = (app: NestExpressApplication): void => {
  app.disable("x-powered-by");
  app.useGlobalFilters(new ProblemFilter());
  app.enableCors({ origin: "*", methods: ["GET", "HEAD", "OPTIONS"] });
};
