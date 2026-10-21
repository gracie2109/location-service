import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let handler: Promise<Handler> | undefined;

const createHandler = async (): Promise<Handler> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["error", "warn"] });
  configureApp(app);
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
};

/** One Nest app per warm serverless instance; a failed start is retried on the next request. */
export const getHandler = (): Promise<Handler> => {
  handler ??= createHandler().catch((error: unknown) => {
    handler = undefined;
    throw error;
  });
  return handler;
};
