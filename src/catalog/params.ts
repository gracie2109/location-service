import { z } from "zod";
import { InvalidParameterException } from "../common/exceptions";
import { todayInVietnam } from "./as-of";
import { UNIT_TYPES } from "./types";

const CODE = /^vn_[0-9a-hjkmnp-tv-z]{20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

const csv = (text: string): string[] => text.split(",").map((part) => part.trim()).filter(Boolean);

const isRealDate = (value: string): boolean => new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
const date = z.string().regex(DATE, "must be a date as YYYY-MM-DD").refine(isRealDate, "is not a real date");
const limit = z.coerce.number().int().min(1, "must be between 1 and 500").max(MAX_LIMIT, "must be between 1 and 500").default(DEFAULT_LIMIT);
const cursor = z.string().min(1).max(200);
const enumList = <T extends string>(allowed: readonly T[]) =>
  z.string().transform(csv).pipe(z.array(z.enum(allowed as [T, ...T[]])).min(1));

export const provincesQuery = z.object({
  as_of: date.optional(),
  sort: z.enum(["name", "official_code"]).default("name"),
});

export const communesQuery = z.object({
  q: z.string().min(2, "must be 2-100 characters").max(100, "must be 2-100 characters").optional(),
  unit_type: enumList(UNIT_TYPES).optional(),
  as_of: date.optional(),
  sort: z.enum(["name", "official_code"]).default("name"),
  limit,
  cursor: cursor.optional(),
});

export const locationQuery = z.object({ as_of: date.optional() });

export const searchQuery = z.object({
  q: z.string().min(2, "must be 2-100 characters").max(100, "must be 2-100 characters"),
  level: enumList(["province", "district", "commune"] as const).optional(),
  province: z.string().regex(CODE, "is not a location code").optional(),
  include_retired: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
  limit,
  cursor: cursor.optional(),
});

/** Validates a query string; every problem is reported by parameter name. */
export const parseQuery = <S extends z.ZodType>(schema: S, query: unknown): z.output<S> => {
  const result = schema.safeParse(query);
  if (result.success) return result.data;
  throw new InvalidParameterException(
    result.error.issues.map((issue) => ({ parameter: String(issue.path[0] ?? "query"), message: issue.message })),
  );
};

export const isLocationCode = (value: string): boolean => CODE.test(value);

/** `as_of` or today (Vietnam) when absent. */
export const dateOrToday = (asOf: string | undefined): string => asOf ?? todayInVietnam();
