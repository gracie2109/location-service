import { SetMetadata } from "@nestjs/common";
import type { Scope } from "./api-key";

export const SCOPE_METADATA = "required-scopes";

/** Marks a route as needing an API key that holds all of these scopes. */
export const RequireScope = (...scopes: Scope[]) => SetMetadata(SCOPE_METADATA, scopes);
