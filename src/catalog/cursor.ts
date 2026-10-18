import { CursorStaleException, InvalidParameterException } from "../common/exceptions";

type CursorPayload = { v: string; o: number };

export const encodeCursor = (catalogVersion: string, offset: number): string =>
  Buffer.from(JSON.stringify({ v: catalogVersion, o: offset } satisfies CursorPayload)).toString("base64url");

const decode = (cursor: string): CursorPayload | null => {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof value !== "object" || value === null) return null;
    const { v, o } = value as Record<string, unknown>;
    return typeof v === "string" && typeof o === "number" && Number.isInteger(o) && o >= 0 ? { v, o } : null;
  } catch {
    return null;
  }
};

/** The offset a cursor points to; 0 without a cursor. Malformed → 400, issued for another catalog version → 409. */
export const offsetFromCursor = (cursor: string | undefined, catalogVersion: string): number => {
  if (cursor === undefined) return 0;
  const payload = decode(cursor);
  if (!payload) throw new InvalidParameterException([{ parameter: "cursor", message: "is not a valid cursor" }]);
  if (payload.v !== catalogVersion) throw new CursorStaleException();
  return payload.o;
};

export type Page<T> = { items: T[]; nextCursor: string | null };

/** One page of an already ordered list. */
export const paginate = <T>(all: T[], offset: number, limit: number, catalogVersion: string): Page<T> => {
  const items = all.slice(offset, offset + limit);
  const end = offset + items.length;
  return { items, nextCursor: end < all.length ? encodeCursor(catalogVersion, end) : null };
};
