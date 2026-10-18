export type Level = "province" | "district" | "commune";

export type UnitType =
  | "province" | "municipality" | "ward" | "commune" | "special_zone"
  | "urban_district" | "rural_district" | "town" | "provincial_city" | "township";

export const UNIT_TYPES: readonly UnitType[] = [
  "province", "municipality", "ward", "commune", "special_zone",
  "urban_district", "rural_district", "town", "provincial_city", "township",
];

export type SuccessionKind = "replaced_by" | "merged_into" | "split_into" | "part_transferred_to";

/** One row of unit_versions joined with its unit. Dates are ISO `YYYY-MM-DD`. */
export type UnitVersion = {
  code: string;
  level: Level;
  unitType: UnitType;
  officialCode: string | null;
  name: string;
  fullName: string;
  nameEn: string | null;
  fullNameEn: string | null;
  enNamesSource: "derived" | "official" | null;
  parentCode: string | null;
  centroid: { latitude: number; longitude: number } | null;
  centroidSource: string | null;
  validFrom: string;
  validTo: string | null;
  /** Matching keys, computed once when the snapshot is built. */
  nameKey: string;
  fullKey: string;
};

export type Succession = {
  fromCode: string;
  toCode: string;
  kind: SuccessionKind;
  isWhole: boolean;
  basis: string;
  effectiveOn: string;
};

export type CatalogInfo = {
  id: string;
  source: string;
  sourceRef: string;
  effectiveOn: string;
  extractedAt: string;
  fileSha256: string;
  recordCounts: Record<string, number>;
  isCurrent: boolean;
  importedAt: string;
};

/** Everything the read API needs, held in memory for one catalog version. */
export type Snapshot = {
  catalog: CatalogInfo;
  versions: CatalogInfo[];
  /** Versions of each unit, oldest first. */
  byCode: Map<string, UnitVersion[]>;
  successionsFrom: Map<string, Succession[]>;
  successionsTo: Map<string, Succession[]>;
};
