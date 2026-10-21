import { applyCorrections, parseRows, type Correction, type RawRow } from "./gso-rows";
import { buildLinks, type SuccessionLink } from "./gso-successions";
import { collectUnits, type CollectedUnit } from "./gso-units";

export const LEGACY_EFFECTIVE_ON = "2025-06-30";
export const CURRENT_EFFECTIVE_ON = "2025-07-01";

export type UnitRecord = { level: string; officialCode: string; unitType: string; name: string; fullName: string; parentOfficialCode: string };
export type SuccessionRecord = SuccessionLink & { effectiveOn: string };

export type ConversionReport = {
  source_rows: number;
  corrections_applied: number;
  counts: {
    legacy: { provinces: number; districts: number; communes: number };
    current: { provinces: number; communes: number };
    successions: Record<string, number>;
    identity_communes: number;
    identity_provinces: number;
  };
  conflicts: { level: string; code: string; variants: string[]; rows: number[] }[];
  new_communes_without_predecessor: string[];
  legacy_units_without_successor: { provinces: string[]; communes: string[] };
  warnings: string[];
  errors: string[];
};

export type Conversion = { legacyUnits: UnitRecord[]; currentUnits: UnitRecord[]; successions: SuccessionRecord[]; report: ConversionReport };

const record = (unit: CollectedUnit): UnitRecord => ({
  level: unit.level,
  officialCode: unit.code,
  unitType: unit.unitType,
  name: unit.name,
  fullName: unit.fullName,
  parentOfficialCode: unit.parent ?? "",
});

const sorted = (units: Iterable<CollectedUnit>): UnitRecord[] => [...units].map(record).sort((a, b) => a.officialCode.localeCompare(b.officialCode));

/** Whole conversion from the workbook's cleaned cells to the two catalogs and the successions between them. */
export const convertGso = (rawRows: RawRow[], corrections: Correction[]): Conversion => {
  const errors: string[] = [];
  const fixed = applyCorrections(rawRows, corrections);
  errors.push(...fixed.issues);
  const parsed = parseRows(fixed.rows);
  errors.push(...parsed.issues);

  const { newUnits, oldUnits } = collectUnits(parsed.rows);
  const links = buildLinks(parsed.rows, oldUnits);

  const legacyUnits = [...sorted(oldUnits.provinces.values()), ...sorted(oldUnits.districts.values()), ...sorted(oldUnits.communes.values())];
  const currentUnits = [...sorted(newUnits.provinces.values()), ...sorted(newUnits.communes.values())];
  const legacyCodes = new Set(legacyUnits.map((unit) => unit.officialCode));
  const currentCodes = new Set(currentUnits.map((unit) => unit.officialCode));

  for (const unit of legacyUnits) {
    if (unit.parentOfficialCode && !legacyCodes.has(unit.parentOfficialCode)) errors.push(`legacy ${unit.level} ${unit.officialCode} has parent ${unit.parentOfficialCode}, which is not in the legacy catalog`);
  }

  const seen = new Set<string>();
  const successions: SuccessionRecord[] = [];
  for (const link of links.successions) {
    const key = `${link.from}|${link.to}|${link.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!legacyCodes.has(link.from)) errors.push(`succession from ${link.from} to ${link.to}: ${link.from} is not in the legacy catalog`);
    else if (!currentCodes.has(link.to)) errors.push(`succession from ${link.from} to ${link.to}: ${link.to} is not in the current catalog`);
    else successions.push({ ...link, effectiveOn: CURRENT_EFFECTIVE_ON });
  }
  successions.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  const fromCodes = new Set(successions.map((s) => s.from));
  const toCodes = new Set(successions.map((s) => s.to));
  const legacyUnitsWithout = (level: string, continuing: Set<string>) =>
    legacyUnits.filter((unit) => unit.level === level && !fromCodes.has(unit.officialCode) && !continuing.has(unit.officialCode)).map((unit) => unit.officialCode);

  const byKind: Record<string, number> = {};
  for (const s of successions) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;

  const report: ConversionReport = {
    source_rows: rawRows.length,
    corrections_applied: fixed.applied,
    counts: {
      legacy: {
        provinces: legacyUnits.filter((u) => u.level === "province").length,
        districts: legacyUnits.filter((u) => u.level === "district").length,
        communes: legacyUnits.filter((u) => u.level === "commune").length,
      },
      current: { provinces: newUnits.provinces.size, communes: newUnits.communes.size },
      successions: byKind,
      identity_communes: links.identityCommunes.size,
      identity_provinces: links.identityProvinces.size,
    },
    conflicts: [...oldUnits.conflicts, ...newUnits.conflicts],
    new_communes_without_predecessor: currentUnits
      .filter((u) => u.level === "commune" && !links.identityCommunes.has(u.officialCode) && !toCodes.has(u.officialCode))
      .map((u) => u.officialCode),
    legacy_units_without_successor: { provinces: legacyUnitsWithout("province", links.identityProvinces), communes: legacyUnitsWithout("commune", links.identityCommunes) },
    warnings: links.warnings,
    errors,
  };
  return { legacyUnits, currentUnits, successions, report };
};
