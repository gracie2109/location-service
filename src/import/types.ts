import type { SuccessionKind, UnitType } from "../catalog/types";

export type ImportLevel = "province" | "commune";

export type FileIssue = { file: string; line: number | null; message: string };

export type ParsedUnit = {
  line: number;
  level: ImportLevel;
  officialCode: string;
  unitType: UnitType;
  name: string;
  fullName: string;
  parentOfficialCode: string | null;
  nameEn: string | null;
  fullNameEn: string | null;
  enNamesSource: "derived" | "official" | null;
  centroid: { latitude: number; longitude: number } | null;
  centroidSource: string | null;
};

export type ParsedSuccession = {
  line: number;
  fromOfficialCode: string;
  toOfficialCode: string;
  kind: SuccessionKind;
  isWhole: boolean;
  basis: string;
  effectiveOn: string;
};

/** A unit in force in the database right now, as the planner sees it. */
export type CurrentUnit = {
  code: string;
  level: string;
  officialCode: string | null;
  unitType: string;
  name: string;
  fullName: string;
  nameEn: string | null;
  fullNameEn: string | null;
  enNamesSource: string | null;
  parentCode: string | null;
  centroidLat: number | null;
  centroidLon: number | null;
  centroidSource: string | null;
  validFrom: string;
};

export type PlannedUnit = { code: string; unit: ParsedUnit; parentCode: string | null };
export type PlannedChange = PlannedUnit & { fields: string[] };
export type PlannedRetire = { code: string; level: string; officialCode: string; fullName: string };
export type PlannedSuccession = { fromCode: string; toCode: string; line: number; kind: SuccessionKind; isWhole: boolean; basis: string; effectiveOn: string };

export type Plan = {
  added: PlannedUnit[];
  changed: PlannedChange[];
  unchanged: number;
  retired: PlannedRetire[];
  retiredWithoutSuccessor: PlannedRetire[];
  successions: PlannedSuccession[];
  errors: string[];
};
