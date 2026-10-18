import { CursorStaleException, InvalidParameterException } from "../../src/common/exceptions";
import { encodeCursor, offsetFromCursor, paginate } from "../../src/catalog/cursor";

describe("cursor", () => {
  it("is offset 0 without a cursor", () => {
    expect(offsetFromCursor(undefined, "v1")).toBe(0);
  });

  it("round-trips an offset for the same catalog version", () => {
    expect(offsetFromCursor(encodeCursor("v1", 40), "v1")).toBe(40);
  });

  it("is stale for another catalog version", () => {
    expect(() => offsetFromCursor(encodeCursor("v1", 40), "v2")).toThrow(CursorStaleException);
  });

  it.each(["!!!", "e30", Buffer.from('{"v":"v1","o":-1}').toString("base64url"), Buffer.from('{"v":"v1","o":1.5}').toString("base64url")])(
    "rejects malformed cursor %s",
    (cursor) => {
      expect(() => offsetFromCursor(cursor, "v1")).toThrow(InvalidParameterException);
    },
  );
});

describe("paginate", () => {
  const all = [1, 2, 3, 4, 5];

  it("returns a next cursor until the end", () => {
    const first = paginate(all, 0, 2, "v1");
    expect(first.items).toEqual([1, 2]);
    const second = paginate(all, offsetFromCursor(first.nextCursor ?? undefined, "v1"), 2, "v1");
    expect(second.items).toEqual([3, 4]);
    const last = paginate(all, 4, 2, "v1");
    expect(last).toEqual({ items: [5], nextCursor: null });
  });

  it("has no next cursor when the page ends exactly at the end", () => {
    expect(paginate(all, 3, 2, "v1").nextCursor).toBeNull();
  });

  it("is empty past the end", () => {
    expect(paginate(all, 9, 2, "v1")).toEqual({ items: [], nextCursor: null });
  });
});
