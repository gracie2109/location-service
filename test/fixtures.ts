import { buildSnapshot } from "../src/catalog/snapshot";
import type { CatalogInfo, Level, Snapshot, Succession, UnitType, UnitVersion } from "../src/catalog/types";
import { testCode } from "./db/helpers";

/**
 * Invented administrative units for tests. Names say "Ví Dụ" (example) and none of this is catalog data.
 * Shape: two provinces; communes under them; one retired district with a retired commune merged into a current one.
 */
type FixtureUnit = {
  n: number;
  level: Level;
  unitType: UnitType;
  officialCode: string | null;
  name: string;
  fullName: string;
  parent: number | null;
  validFrom: string;
  validTo: string | null;
};

export const FIXTURE_VERSION_ID = "fixture-test-1";

export const code = (n: number): string => testCode(n);

export const FIXTURE_UNITS: FixtureUnit[] = [
  { n: 1, level: "province", unitType: "province", officialCode: "90", name: "Ví Dụ Một", fullName: "Tỉnh Ví Dụ Một", parent: null, validFrom: "2020-01-01", validTo: null },
  { n: 2, level: "province", unitType: "municipality", officialCode: "91", name: "Ví Dụ Hai", fullName: "Thành phố Ví Dụ Hai", parent: null, validFrom: "2020-01-01", validTo: null },
  { n: 3, level: "commune", unitType: "ward", officialCode: "90001", name: "Ví Dụ Alpha", fullName: "Phường Ví Dụ Alpha", parent: 1, validFrom: "2025-07-01", validTo: null },
  { n: 4, level: "commune", unitType: "commune", officialCode: "90002", name: "Ví Dụ Beta", fullName: "Xã Ví Dụ Beta", parent: 1, validFrom: "2025-07-01", validTo: null },
  { n: 5, level: "commune", unitType: "special_zone", officialCode: "90003", name: "Ví Dụ Đảo", fullName: "Đặc khu Ví Dụ Đảo", parent: 1, validFrom: "2025-07-01", validTo: null },
  { n: 6, level: "commune", unitType: "ward", officialCode: "91001", name: "Ví Dụ Alpha", fullName: "Phường Ví Dụ Alpha", parent: 2, validFrom: "2025-07-01", validTo: null },
  { n: 7, level: "district", unitType: "rural_district", officialCode: "901", name: "Cũ Một", fullName: "Huyện Cũ Một", parent: 1, validFrom: "2000-01-01", validTo: "2025-07-01" },
  { n: 8, level: "commune", unitType: "commune", officialCode: "90100", name: "Cũ Một", fullName: "Xã Cũ Một", parent: 7, validFrom: "2000-01-01", validTo: "2025-07-01" },
];

export const FIXTURE_SUCCESSIONS: Succession[] = [
  { fromCode: code(8), toCode: code(4), kind: "merged_into", isWhole: true, basis: "Fixture resolution, not real", effectiveOn: "2025-07-01" },
];

export const fixtureCatalog = (id = FIXTURE_VERSION_ID): CatalogInfo => ({
  id,
  source: "fixture",
  sourceRef: "test fixture, not real data",
  effectiveOn: "2025-07-01",
  extractedAt: "2026-01-01T00:00:00Z",
  fileSha256: id.padEnd(64, "0").replace(/[^0-9a-f]/g, "a"),
  recordCounts: {},
  isCurrent: true,
  importedAt: "2026-01-01T00:00:00Z",
});

type RawVersion = Omit<UnitVersion, "nameKey" | "fullKey">;

export const fixtureRows = (): RawVersion[] =>
  FIXTURE_UNITS.map((unit) => ({
    code: code(unit.n),
    level: unit.level,
    unitType: unit.unitType,
    officialCode: unit.officialCode,
    name: unit.name,
    fullName: unit.fullName,
    nameEn: null,
    fullNameEn: null,
    enNamesSource: null,
    parentCode: unit.parent === null ? null : code(unit.parent),
    centroid: null,
    centroidSource: null,
    validFrom: unit.validFrom,
    validTo: unit.validTo,
  }));

export const fixtureSnapshot = (): Snapshot => {
  const catalog = fixtureCatalog();
  return buildSnapshot(catalog, [catalog], fixtureRows(), FIXTURE_SUCCESSIONS);
};

/** The fixture as rows ready for `insertFixtureUnits`. */
export const fixtureDbRows = () =>
  fixtureRows().map(({ code: unitCode, level, unitType, officialCode, name, fullName, parentCode, validFrom, validTo }) => ({
    code: unitCode, level, unitType, officialCode, name, fullName, parentCode, validFrom, validTo,
  }));
