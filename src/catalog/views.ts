import { isActive, versionOn, versionToShow, todayInVietnam } from "./as-of";
import type { CatalogInfo, Level, Snapshot, Succession, SuccessionKind, UnitType, UnitVersion } from "./types";

type Centroid = { latitude: number; longitude: number } | null;

export type LocationView = {
  code: string;
  level: Level;
  unit_type: UnitType;
  official_code: string | null;
  name: string;
  full_name: string;
  name_en: string | null;
  full_name_en: string | null;
  parent_code: string | null;
  status: "active" | "retired";
  effective_from: string;
  effective_to: string | null;
  centroid: Centroid;
};

export type LocationRefView = { code: string; level: Level; full_name: string; official_code: string | null };

export type SuccessionLinkView = {
  code: string;
  full_name: string;
  kind: SuccessionKind;
  is_whole: boolean;
  basis: string;
  effective_on: string;
};

export type LocationDetailView = LocationView & {
  parent: LocationRefView | null;
  en_names_source: "derived" | "official" | null;
  centroid_source: string | null;
  replaced_by: SuccessionLinkView[];
};

export const toLocationView = (snapshot: Snapshot, version: UnitVersion): LocationView => ({
  code: version.code,
  level: version.level,
  unit_type: version.unitType,
  official_code: version.officialCode,
  name: version.name,
  full_name: version.fullName,
  name_en: version.nameEn,
  full_name_en: version.fullNameEn,
  parent_code: version.parentCode,
  status: isActive(snapshot.byCode.get(version.code) ?? []) ? "active" : "retired",
  effective_from: version.validFrom,
  effective_to: version.validTo,
  centroid: version.centroid,
});

export const toRefView = (version: UnitVersion): LocationRefView => ({
  code: version.code,
  level: version.level,
  full_name: version.fullName,
  official_code: version.officialCode,
});

/** The parent as it was when `version` was in force (or, for a version in force today, as it is today). */
export const parentOf = (snapshot: Snapshot, version: UnitVersion, asOf?: string): UnitVersion | undefined => {
  if (!version.parentCode) return undefined;
  const versions = snapshot.byCode.get(version.parentCode);
  if (!versions) return undefined;
  const date = asOf ?? (version.validTo === null ? todayInVietnam() : version.validFrom);
  return versionOn(versions, date) ?? versionToShow(versions);
};

/** The province a unit belongs to, following parents (commune → district → province). */
export const provinceOf = (snapshot: Snapshot, version: UnitVersion, asOf?: string): UnitVersion | undefined => {
  let current: UnitVersion | undefined = version;
  for (let depth = 0; current && depth < 3; depth += 1) {
    if (current.level === "province") return current;
    current = parentOf(snapshot, current, asOf);
  }
  return undefined;
};

const toSuccessionLink = (snapshot: Snapshot, succession: Succession, otherCode: string): SuccessionLinkView => ({
  code: otherCode,
  full_name: versionToShow(snapshot.byCode.get(otherCode) ?? [])?.fullName ?? "",
  kind: succession.kind,
  is_whole: succession.isWhole,
  basis: succession.basis,
  effective_on: succession.effectiveOn,
});

export const successorsOf = (snapshot: Snapshot, code: string): SuccessionLinkView[] =>
  (snapshot.successionsFrom.get(code) ?? []).map((succession) => toSuccessionLink(snapshot, succession, succession.toCode));

export const predecessorsOf = (snapshot: Snapshot, code: string): SuccessionLinkView[] =>
  (snapshot.successionsTo.get(code) ?? []).map((succession) => toSuccessionLink(snapshot, succession, succession.fromCode));

export const toDetailView = (snapshot: Snapshot, version: UnitVersion, asOf?: string): LocationDetailView => {
  const base = toLocationView(snapshot, version);
  const parent = parentOf(snapshot, version, asOf);
  return {
    ...base,
    parent: parent ? toRefView(parent) : null,
    en_names_source: version.enNamesSource,
    centroid_source: version.centroidSource,
    replaced_by: base.status === "retired" ? successorsOf(snapshot, version.code) : [],
  };
};

export const toHistoryView = (snapshot: Snapshot, code: string, versions: UnitVersion[]) => ({
  code,
  versions: versions.map((version) => ({
    effective_from: version.validFrom,
    effective_to: version.validTo,
    official_code: version.officialCode,
    unit_type: version.unitType,
    name: version.name,
    full_name: version.fullName,
    parent_code: version.parentCode,
  })),
  predecessors: predecessorsOf(snapshot, code),
  successors: successorsOf(snapshot, code),
});

export const toCatalogView = (catalog: CatalogInfo) => ({
  id: catalog.id,
  source: catalog.source,
  source_ref: catalog.sourceRef,
  effective_on: catalog.effectiveOn,
  extracted_at: catalog.extractedAt,
  file_sha256: catalog.fileSha256,
  record_counts: catalog.recordCounts,
  is_current: catalog.isCurrent,
  imported_at: catalog.importedAt,
});
