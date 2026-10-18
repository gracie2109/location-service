import type { NestExpressApplication } from "@nestjs/platform-express";
import { ProblemFilter } from "./common/problem.filter";
import { loadEnv } from "./config/env";

/** Shared by main.ts and the tests so both run the same app. */
export const configureApp = (app: NestExpressApplication): void => {
  app.disable("x-powered-by");
  app.set("trust proxy", loadEnv().TRUST_PROXY_HOPS);
  app.setGlobalPrefix("api/v1", { exclude: ["health", "ready"] });
  app.useGlobalFilters(new ProblemFilter());
  app.enableCors({ origin: "*", methods: ["GET", "HEAD", "OPTIONS"] });
};
