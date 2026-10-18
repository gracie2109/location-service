import { buildPlan } from "../../src/import/plan";
import type { CurrentUnit, ParsedSuccession, ParsedUnit } from "../../src/import/types";

/** Invented units; nothing here is catalog data. */
let counter = 0;
const nextCode = () => `new${(counter += 1)}`;

const current = (officialCode: string, patch: Partial<CurrentUnit> = {}): CurrentUnit => ({
  code: `old${officialCode}`,
  level: officialCode.length === 2 ? "province" : "commune",
  officialCode,
  unitType: officialCode.length === 2 ? "province" : "ward",
  name: `Name ${officialCode}`,
  fullName: `Full ${officialCode}`,
  nameEn: null,
  fullNameEn: null,
  enNamesSource: null,
  parentCode: officialCode.length === 2 ? null : "old90",
  centroidLat: null,
  centroidLon: null,
  centroidSource: null,
  validFrom: "2025-07-01",
  ...patch,
});

const unit = (officialCode: string, patch: Partial<ParsedUnit> = {}): ParsedUnit => ({
  line: 2,
  level: officialCode.length === 2 ? "province" : "commune",
  officialCode,
  unitType: officialCode.length === 2 ? "province" : "ward",
  name: `Name ${officialCode}`,
  fullName: `Full ${officialCode}`,
  parentOfficialCode: officialCode.length === 2 ? null : "90",
  nameEn: null,
  fullNameEn: null,
  enNamesSource: null,
  centroid: null,
  centroidSource: null,
  ...patch,
});

const succession = (from: string, to: string, patch: Partial<ParsedSuccession> = {}): ParsedSuccession => ({
  line: 2, fromOfficialCode: from, toOfficialCode: to, kind: "merged_into", isWhole: true, basis: "Fixture", effectiveOn: "2026-01-01", ...patch,
});

const base = { effectiveOn: "2026-01-01", retireWithoutSuccessor: false, successions: [] as ParsedSuccession[] };

describe("buildPlan", () => {
  it("adds units to an empty database, with parents resolved to new codes", () => {
    const plan = buildPlan({ ...base, current: [], units: [unit("90"), unit("90001")] }, nextCode);
    expect(plan.errors).toEqual([]);
    expect(plan.added).toHaveLength(2);
    const [province, commune] = plan.added;
    expect(commune?.parentCode).toBe(province?.code);
  });

  it("leaves identical units alone", () => {
    const plan = buildPlan({ ...base, current: [current("90"), current("90001")], units: [unit("90"), unit("90001")] }, nextCode);
    expect(plan).toMatchObject({ added: [], changed: [], retired: [], unchanged: 2, errors: [] });
  });

  it("versions a unit whose attributes changed and keeps its code", () => {
    const plan = buildPlan({ ...base, current: [current("90"), current("90001")], units: [unit("90"), unit("90001", { fullName: "Renamed" })] }, nextCode);
    expect(plan.changed).toEqual([expect.objectContaining({ code: "old90001", fields: ["full_name"] })]);
  });

  it("refuses to change a unit whose current version is not older than the effective date", () => {
    const plan = buildPlan({ ...base, effectiveOn: "2025-07-01", current: [current("90"), current("90001")], units: [unit("90"), unit("90001", { name: "X" })] }, nextCode);
    expect(plan.errors[0]).toContain("starts 2025-07-01, not before 2025-07-01");
  });

  it("stops when a unit disappears without a succession, and says which", () => {
    const plan = buildPlan({ ...base, current: [current("90"), current("90001"), current("90002")], units: [unit("90"), unit("90001")] }, nextCode);
    expect(plan.errors[0]).toContain("1 unit(s) disappear without a succession (for example 90002)");
  });

  it("retires a unit that has a succession to a unit in the file", () => {
    const plan = buildPlan(
      { ...base, current: [current("90"), current("90001"), current("90002")], units: [unit("90"), unit("90001")], successions: [succession("90002", "90001")] },
      nextCode,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.retired.map((r) => r.officialCode)).toEqual(["90002"]);
    expect(plan.successions).toEqual([expect.objectContaining({ fromCode: "old90002", toCode: "old90001" })]);
  });

  it("allows retiring without a successor only when asked, and reports it", () => {
    const plan = buildPlan({ ...base, retireWithoutSuccessor: true, current: [current("90"), current("90002")], units: [unit("90")] }, nextCode);
    expect(plan.errors).toEqual([]);
    expect(plan.retiredWithoutSuccessor.map((r) => r.officialCode)).toEqual(["90002"]);
  });

  it("gives a new code to a unit whose official code was kept for a changed territory", () => {
    const plan = buildPlan(
      { ...base, current: [current("90"), current("90001")], units: [unit("90"), unit("90001", { fullName: "Merged" })], successions: [succession("90001", "90001")] },
      nextCode,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.retired.map((r) => r.code)).toEqual(["old90001"]);
    expect(plan.added).toHaveLength(1);
    expect(plan.added[0]?.code).not.toBe("old90001");
    expect(plan.successions).toEqual([expect.objectContaining({ fromCode: "old90001", toCode: plan.added[0]?.code })]);
  });

  it("reports successions that point nowhere", () => {
    const plan = buildPlan({ ...base, current: [current("90")], units: [unit("90")], successions: [succession("90009", "90")] }, nextCode);
    expect(plan.errors[0]).toContain("90009 is not a unit in force before this import");
  });

  it("reports a commune whose province is not in the file", () => {
    const plan = buildPlan({ ...base, current: [], units: [unit("90001")] }, nextCode);
    expect(plan.errors[0]).toContain("parent province 90 is not in the file");
  });
});
