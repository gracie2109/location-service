import { versionToShow } from "../../catalog/as-of";
import { normalizeText } from "../../catalog/normalize";
import type { Snapshot, UnitVersion } from "../../catalog/types";
import { provinceOf } from "../../catalog/views";
import { GHN_ACTIVE, type GhnUnit, type Proposal } from "./types";

/** Units in force today with the level asked for. */
const unitsInForce = (snapshot: Snapshot, level: UnitVersion["level"]): UnitVersion[] => {
  const result: UnitVersion[] = [];
  for (const versions of snapshot.byCode.values()) {
    const version = versionToShow(versions);
    if (version && version.validTo === null && version.level === level) result.push(version);
  }
  return result;
};

/**
 * A GHN record matches a unit when the unit's official full name equals GHN's name or one of its
 * variants, or GHN's bare name equals the unit's bare name (GHN omits "Tỉnh" and "Thành phố" for provinces).
 * Matching is by text only to *suggest*: a person confirms before anything is used.
 */
const matches = (ghn: GhnUnit, unit: UnitVersion): boolean => {
  const names = new Set([ghn.name, ...ghn.extensionNames].map(normalizeText));
  return names.has(unit.fullKey) || normalizeText(ghn.name) === unit.nameKey;
};

const propose = (ghn: GhnUnit, level: Proposal["level"], parentCode: string | null, candidates: UnitVersion[]): Proposal => {
  const base = {
    level,
    providerCode: String(ghn.id),
    providerParentCode: parentCode,
    providerName: ghn.name,
    providerStatus: ghn.status,
  };
  if (ghn.status !== GHN_ACTIVE) return { ...base, reason: "no_match", suggestedCode: null, candidateCodes: [] };
  const codes = candidates.map((unit) => unit.code).sort();
  if (codes.length === 1) return { ...base, reason: "exact_name", suggestedCode: codes[0] ?? null, candidateCodes: codes };
  if (codes.length > 1) return { ...base, reason: "ambiguous", suggestedCode: null, candidateCodes: codes };
  return { ...base, reason: "no_match", suggestedCode: null, candidateCodes: [] };
};

export const matchProvinces = (snapshot: Snapshot, ghnProvinces: GhnUnit[]): Proposal[] => {
  const provinces = unitsInForce(snapshot, "province");
  return ghnProvinces.map((ghn) => propose(ghn, "province", null, provinces.filter((unit) => matches(ghn, unit))));
};

/**
 * Wards are only compared with communes of the province already confirmed for the GHN province, so the
 * same ward name in two provinces never gets mixed up. `provinceUnitByGhnId` maps GHN province id → unit code.
 */
export const matchWards = (snapshot: Snapshot, ghnWards: GhnUnit[], provinceUnitByGhnId: Map<string, string>): { proposals: Proposal[]; skipped: GhnUnit[] } => {
  const communesByProvince = new Map<string, UnitVersion[]>();
  for (const commune of unitsInForce(snapshot, "commune")) {
    const province = provinceOf(snapshot, commune);
    if (!province) continue;
    const list = communesByProvince.get(province.code) ?? [];
    list.push(commune);
    communesByProvince.set(province.code, list);
  }

  const proposals: Proposal[] = [];
  const skipped: GhnUnit[] = [];
  for (const ghn of ghnWards) {
    const provinceCode = provinceUnitByGhnId.get(String(ghn.parentId));
    if (!provinceCode) {
      skipped.push(ghn);
      continue;
    }
    const pool = communesByProvince.get(provinceCode) ?? [];
    proposals.push(propose(ghn, "commune", String(ghn.parentId), pool.filter((unit) => matches(ghn, unit))));
  }
  return { proposals, skipped };
};
