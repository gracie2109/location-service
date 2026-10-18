import { matchProvinces, matchWards } from "../../src/providers/ghn/matcher";
import type { GhnUnit } from "../../src/providers/ghn/types";
import { code, fixtureSnapshot } from "../fixtures";

const snapshot = fixtureSnapshot();
const ghn = (id: number, name: string, over: Partial<GhnUnit> = {}): GhnUnit => ({ id, name, extensionNames: [], status: 1, parentId: 1, ...over });

describe("matchProvinces", () => {
  it("suggests a unit whose bare or full name equals GHN's name, ignoring diacritics", () => {
    const [one, two] = matchProvinces(snapshot, [ghn(1000001, "Ví Dụ Một"), ghn(1000002, "VI DU HAI", { extensionNames: ["thành phố ví dụ hai"] })]);
    expect(one).toMatchObject({ reason: "exact_name", suggestedCode: code(1), providerCode: "1000001" });
    expect(two).toMatchObject({ reason: "exact_name", suggestedCode: code(2) });
  });

  it("reports no match for an unknown name and never suggests for a switched-off record", () => {
    const [unknown, off] = matchProvinces(snapshot, [ghn(1, "Không Có"), ghn(2, "Ví Dụ Một", { status: 2 })]);
    expect(unknown).toMatchObject({ reason: "no_match", suggestedCode: null, candidateCodes: [] });
    expect(off).toMatchObject({ reason: "no_match", suggestedCode: null, providerStatus: 2 });
  });
});

describe("matchWards", () => {
  const wards = [ghn(1003646, "Phường Ví Dụ Alpha", { parentId: 1000001 }), ghn(1009999, "Phường Ví Dụ Alpha", { parentId: 1000002 })];

  it("compares a ward only with communes of the province confirmed for its GHN province", () => {
    const provinces = new Map([["1000001", code(1)], ["1000002", code(2)]]);
    const { proposals, skipped } = matchWards(snapshot, wards, provinces);
    expect(skipped).toEqual([]);
    expect(proposals.map((p) => [p.providerCode, p.reason, p.suggestedCode, p.providerParentCode])).toEqual([
      ["1003646", "exact_name", code(3), "1000001"],
      ["1009999", "exact_name", code(6), "1000002"],
    ]);
  });

  it("skips wards of a province nobody confirmed yet", () => {
    const { proposals, skipped } = matchWards(snapshot, wards, new Map([["1000001", code(1)]]));
    expect(proposals).toHaveLength(1);
    expect(skipped.map((w) => w.id)).toEqual([1009999]);
  });

  it("marks a name that fits several communes of the province as ambiguous", () => {
    // "Ví Dụ Alpha" as a bare name fits only one commune here; make two fit by using the bare name of a type-less GHN record
    const dupSnapshot = fixtureSnapshot();
    const alpha = dupSnapshot.byCode.get(code(3))?.[0];
    const copyCode = code(21);
    if (alpha) dupSnapshot.byCode.set(copyCode, [{ ...alpha, code: copyCode, unitType: "commune", fullName: "Xã Ví Dụ Alpha", fullKey: "xa vi du alpha" }]);
    const { proposals } = matchWards(dupSnapshot, [ghn(5, "Ví Dụ Alpha", { parentId: 1000001 })], new Map([["1000001", code(1)]]));
    expect(proposals[0]).toMatchObject({ reason: "ambiguous", suggestedCode: null });
    expect(proposals[0]?.candidateCodes).toHaveLength(2);
  });
});
