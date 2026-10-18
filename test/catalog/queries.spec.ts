import { versionOn, versionToShow } from "../../src/catalog/as-of";
import { listCommunes, listProvinces, scoreVersion, searchUnits } from "../../src/catalog/queries";
import { toDetailView, toHistoryView, toLocationView } from "../../src/catalog/views";
import { code, fixtureSnapshot } from "../fixtures";

const snapshot = fixtureSnapshot();
const names = (versions: { fullName: string }[]) => versions.map((version) => version.fullName);

describe("as-of", () => {
  const versions = snapshot.byCode.get(code(7)) ?? [];

  it("finds the version in force, end date exclusive", () => {
    expect(versionOn(versions, "2025-06-30")?.code).toBe(code(7));
    expect(versionOn(versions, "2025-07-01")).toBeUndefined();
  });

  it("shows the last version of a retired unit", () => {
    expect(versionToShow(versions)?.validTo).toBe("2025-07-01");
  });
});

describe("listProvinces", () => {
  it("lists provinces in force today, sorted by name", () => {
    expect(names(listProvinces(snapshot, undefined, "name"))).toEqual(["Thành phố Ví Dụ Hai", "Tỉnh Ví Dụ Một"]);
  });

  it("sorts by official code", () => {
    expect(listProvinces(snapshot, undefined, "official_code").map((v) => v.officialCode)).toEqual(["90", "91"]);
  });

  it("is empty before the provinces existed", () => {
    expect(listProvinces(snapshot, "2019-12-31", "name")).toEqual([]);
  });
});

describe("listCommunes", () => {
  it("lists only the communes of the province", () => {
    expect(names(listCommunes(snapshot, code(1), { sort: "official_code" }))).toEqual([
      "Phường Ví Dụ Alpha",
      "Xã Ví Dụ Beta",
      "Đặc khu Ví Dụ Đảo",
    ]);
    expect(names(listCommunes(snapshot, code(2), { sort: "name" }))).toEqual(["Phường Ví Dụ Alpha"]);
  });

  it("filters by unit type and by name without diacritics", () => {
    expect(names(listCommunes(snapshot, code(1), { sort: "name", unitTypes: ["special_zone"] }))).toEqual(["Đặc khu Ví Dụ Đảo"]);
    expect(names(listCommunes(snapshot, code(1), { sort: "name", q: "beta" }))).toEqual(["Xã Ví Dụ Beta"]);
  });

  it("follows the old district for a date before the reform", () => {
    expect(names(listCommunes(snapshot, code(1), { sort: "name", asOf: "2024-01-01" }))).toEqual(["Xã Cũ Một"]);
  });
});

describe("scoreVersion", () => {
  const alpha = snapshot.byCode.get(code(3))?.[0];
  if (!alpha) throw new Error("fixture missing");

  it("ranks exact above prefix above word-start above contains", () => {
    expect(scoreVersion(alpha, "ví dụ alpha")).toBe(1);
    expect(scoreVersion(alpha, "phuong vi")).toBe(0.9);
    expect(scoreVersion(alpha, "alpha")).toBe(0.8);
    expect(scoreVersion(alpha, "lph")).toBe(0.7);
  });

  it("accepts a type abbreviation and ignores diacritics", () => {
    expect(scoreVersion(alpha, "P. Vi Du Alpha")).toBe(1);
  });

  it("tolerates a typo with a low score, and rejects unrelated text", () => {
    const typo = scoreVersion(alpha, "vi du alpa");
    expect(typo).toBeGreaterThan(0);
    expect(typo).toBeLessThanOrEqual(0.6);
    expect(scoreVersion(alpha, "zzzzzzz")).toBe(0);
  });
});

describe("searchUnits", () => {
  it("puts exact matches first, equal scores ordered by name then code, similar names after", () => {
    const hits = searchUnits(snapshot, { q: "vi du alpha", includeRetired: false });
    expect(hits.slice(0, 2).map((hit) => [hit.version.code, hit.score])).toEqual([[code(3), 1], [code(6), 1]]);
    expect(hits.slice(2).every((hit) => hit.score < 1)).toBe(true);
  });

  it("hides retired units unless asked", () => {
    expect(searchUnits(snapshot, { q: "cu mot", includeRetired: false })).toEqual([]);
    expect(names(searchUnits(snapshot, { q: "cu mot", includeRetired: true }).map((hit) => hit.version))).toEqual(
      expect.arrayContaining(["Xã Cũ Một", "Huyện Cũ Một"]),
    );
  });

  it("filters by level and by province", () => {
    expect(searchUnits(snapshot, { q: "vi du", levels: ["province"], includeRetired: false }).map((hit) => hit.version.code)).toEqual(
      expect.arrayContaining([code(1), code(2)]),
    );
    expect(searchUnits(snapshot, { q: "alpha", provinceCode: code(2), includeRetired: false }).map((hit) => hit.version.code)).toEqual([code(6)]);
  });
});

describe("views", () => {
  it("marks a unit active only while a version has no end date", () => {
    expect(toLocationView(snapshot, snapshot.byCode.get(code(3))![0]!).status).toBe("active");
    expect(toLocationView(snapshot, snapshot.byCode.get(code(8))![0]!).status).toBe("retired");
  });

  it("links a retired unit to what replaced it, and an active one to nothing", () => {
    const retired = toDetailView(snapshot, snapshot.byCode.get(code(8))![0]!);
    expect(retired.replaced_by).toEqual([
      { code: code(4), full_name: "Xã Ví Dụ Beta", kind: "merged_into", is_whole: true, basis: "Fixture resolution, not real", effective_on: "2025-07-01" },
    ]);
    expect(retired.parent?.full_name).toBe("Huyện Cũ Một");
    expect(toDetailView(snapshot, snapshot.byCode.get(code(4))![0]!).replaced_by).toEqual([]);
  });

  it("history lists predecessors of the successor", () => {
    const history = toHistoryView(snapshot, code(4), snapshot.byCode.get(code(4)) ?? []);
    expect(history.predecessors.map((link) => link.code)).toEqual([code(8)]);
    expect(history.successors).toEqual([]);
  });
});
