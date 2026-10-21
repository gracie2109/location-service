import type {
  CurrentUnit,
  ParsedSuccession,
  ParsedUnit,
  Plan,
  PlannedChange,
  PlannedRetire,
  PlannedSuccession,
  PlannedUnit,
} from "./types";

export type PlanInput = {
  effectiveOn: string;
  current: CurrentUnit[];
  units: ParsedUnit[];
  successions: ParsedSuccession[];
  retireWithoutSuccessor: boolean;
  /** Levels that may disappear without a succession (for example `district`, abolished on 2025-07-01). */
  retireLevels?: string[];
};

/** The level a parent code belongs to, by its length: 2 digits province, 3 digits district. */
const parentLevel = (officialCode: string): string => (officialCode.length === 2 ? "province" : "district");
const LEVELS = ["province", "district", "commune"];

const key = (level: string, officialCode: string): string => `${level}:${officialCode}`;

/** Names of the attributes that differ between the unit in force and the unit in the file. */
const changedFields = (current: CurrentUnit, unit: ParsedUnit, parentCode: string | null): string[] => {
  const fields: string[] = [];
  if (current.unitType !== unit.unitType) fields.push("unit_type");
  if (current.name !== unit.name) fields.push("name");
  if (current.fullName !== unit.fullName) fields.push("full_name");
  if (current.nameEn !== unit.nameEn) fields.push("name_en");
  if (current.fullNameEn !== unit.fullNameEn) fields.push("full_name_en");
  if (current.enNamesSource !== unit.enNamesSource) fields.push("en_names_source");
  if (current.parentCode !== parentCode) fields.push("parent");
  if (current.centroidLat !== (unit.centroid?.latitude ?? null) || current.centroidLon !== (unit.centroid?.longitude ?? null)) fields.push("centroid");
  if (current.centroidSource !== unit.centroidSource) fields.push("centroid_source");
  return fields;
};

/**
 * Compares the file with the units in force and decides what to add, change and retire.
 * Pure: no database, codes for new units come from `newCode`. Anything doubtful goes to `errors`
 * and the caller must not write.
 */
export const buildPlan = (input: PlanInput, newCode: () => string): Plan => {
  const errors: string[] = [];
  const currentByOfficial = new Map<string, CurrentUnit>();
  for (const unit of input.current) {
    if (unit.officialCode) currentByOfficial.set(key(unit.level, unit.officialCode), unit);
  }

  // Official codes the state kept for a unit whose territory changed: a succession from a code to itself.
  const replacedCodes = new Set(
    input.successions.filter((row) => row.fromOfficialCode === row.toOfficialCode).map((row) => row.fromOfficialCode),
  );

  // Code of every unit in the new state, found by (level, official code).
  const codeInNewState = new Map<string, string>();
  const added: PlannedUnit[] = [];
  const pending: { unit: ParsedUnit; existing: CurrentUnit | undefined; code: string }[] = [];
  for (const unit of input.units) {
    const existing = replacedCodes.has(unit.officialCode) ? undefined : currentByOfficial.get(key(unit.level, unit.officialCode));
    const code = existing?.code ?? newCode();
    codeInNewState.set(key(unit.level, unit.officialCode), code);
    pending.push({ unit, existing, code });
  }

  const changed: PlannedChange[] = [];
  let unchanged = 0;
  for (const { unit, existing, code } of pending) {
    let parentCode: string | null = null;
    if (unit.parentOfficialCode) {
      const level = parentLevel(unit.parentOfficialCode);
      parentCode = codeInNewState.get(key(level, unit.parentOfficialCode)) ?? null;
      if (!parentCode) errors.push(`units line ${unit.line}: parent ${level} ${unit.parentOfficialCode} is not in the file`);
    }
    if (!existing) {
      added.push({ code, unit, parentCode });
      continue;
    }
    const fields = changedFields(existing, unit, parentCode);
    if (fields.length === 0) {
      unchanged += 1;
      continue;
    }
    if (existing.validFrom >= input.effectiveOn) {
      errors.push(`units line ${unit.line}: ${unit.officialCode} changed (${fields.join(", ")}) but its current version starts ${existing.validFrom}, not before ${input.effectiveOn}`);
      continue;
    }
    changed.push({ code, unit, parentCode, fields });
  }

  const retiredAll: PlannedRetire[] = input.current
    .filter((unit) => unit.officialCode && codeInNewState.get(key(unit.level, unit.officialCode)) !== unit.code)
    .map((unit) => ({ code: unit.code, level: unit.level, officialCode: unit.officialCode ?? "", fullName: unit.fullName }));
  for (const retire of retiredAll) {
    const unit = currentByOfficial.get(key(retire.level, retire.officialCode));
    if (unit && unit.validFrom >= input.effectiveOn) {
      errors.push(`${retire.officialCode} is retired but its current version starts ${unit.validFrom}, not before ${input.effectiveOn}`);
    }
  }

  const successions: PlannedSuccession[] = [];
  const resolveFrom = (officialCode: string): string | undefined => {
    const matches = LEVELS.map((level) => currentByOfficial.get(key(level, officialCode))).filter((unit) => unit !== undefined);
    return matches.length === 1 ? matches[0]?.code : undefined;
  };
  const resolveTo = (officialCode: string): string | undefined => {
    const matches = LEVELS.map((level) => codeInNewState.get(key(level, officialCode))).filter((code) => code !== undefined);
    return matches.length === 1 ? matches[0] : undefined;
  };
  for (const row of input.successions) {
    const fromCode = resolveFrom(row.fromOfficialCode);
    const toCode = resolveTo(row.toOfficialCode);
    if (!fromCode) errors.push(`successions line ${row.line}: ${row.fromOfficialCode} is not a unit in force before this import`);
    if (!toCode) errors.push(`successions line ${row.line}: ${row.toOfficialCode} is not in the units file`);
    if (fromCode && toCode) {
      successions.push({ fromCode, toCode, line: row.line, kind: row.kind, isWhole: row.isWhole, basis: row.basis, effectiveOn: row.effectiveOn });
    }
  }

  const withSuccessor = new Set(successions.map((succession) => succession.fromCode));
  const orphaned = retiredAll.filter((retire) => !withSuccessor.has(retire.code));
  const allowedLevels = new Set(input.retireLevels ?? []);
  const retiredWithoutSuccessor = input.retireWithoutSuccessor ? orphaned : orphaned.filter((retire) => allowedLevels.has(retire.level));
  const unexplained = orphaned.filter((retire) => !retiredWithoutSuccessor.includes(retire));
  if (unexplained.length > 0) {
    const sample = unexplained.slice(0, 10).map((retire) => retire.officialCode).join(", ");
    errors.push(`${unexplained.length} unit(s) disappear without a succession (for example ${sample}); add them to the successions file, pass --retire-level for an abolished level, or --retire-without-successor`);
  }

  return { added, changed, unchanged, retired: retiredAll, retiredWithoutSuccessor, successions, errors };
};
