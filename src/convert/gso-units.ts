import type { Named, SourceRow } from "./gso-rows";

export type UnitLevel = "province" | "district" | "commune";
export type CollectedUnit = Named & { level: UnitLevel; parent: string | null };

export type Collected = {
  /** Keyed by official code. */
  provinces: Map<string, CollectedUnit>;
  districts: Map<string, CollectedUnit>;
  communes: Map<string, CollectedUnit>;
  /** Codes whose rows disagree about the unit (different name or parent): left out, listed in the report. */
  conflicts: { level: UnitLevel; code: string; variants: string[]; rows: number[] }[];
};

type Observation = { unit: Named; parent: string | null; row: number };

/** The most common spelling, preferring one with a type word; ties go to the first seen. */
const pickSpelling = (observations: Observation[]): Named => {
  const counts = new Map<string, { unit: Named; count: number }>();
  for (const { unit } of observations) {
    const entry = counts.get(unit.fullName) ?? { unit, count: 0 };
    entry.count += 1;
    counts.set(unit.fullName, entry);
  }
  const ranked = [...counts.values()].sort((a, b) => Number(Boolean(a.unit.bare)) - Number(Boolean(b.unit.bare)) || b.count - a.count);
  return ranked[0]?.unit ?? observations[0]!.unit;
};

const collectLevel = (level: UnitLevel, observations: Map<string, Observation[]>, into: Map<string, CollectedUnit>, conflicts: Collected["conflicts"]): void => {
  for (const [code, list] of [...observations].sort(([a], [b]) => a.localeCompare(b))) {
    // Spellings that differ only by letter case are one unit; anything else is a real disagreement.
    const keys = new Set(list.map((item) => `${item.unit.fullName.toLowerCase()}|${item.parent ?? ""}`));
    if (keys.size > 1) {
      conflicts.push({ level, code, variants: [...new Set(list.map((item) => `${item.unit.fullName} (parent ${item.parent ?? "-"})`))], rows: list.map((item) => item.row) });
      continue;
    }
    const chosen = pickSpelling(list);
    if (chosen.bare) {
      conflicts.push({ level, code, variants: [`${chosen.fullName} (no type word anywhere)`], rows: list.map((item) => item.row) });
      continue;
    }
    into.set(code, { ...chosen, level, parent: list[0]?.parent ?? null });
  }
};

/** Groups every unit seen in the rows by official code and level. */
export const collectUnits = (rows: SourceRow[]): { newUnits: Collected; oldUnits: Collected } => {
  const make = () => ({ province: new Map<string, Observation[]>(), district: new Map<string, Observation[]>(), commune: new Map<string, Observation[]>() });
  const fresh = make();
  const old = make();
  const add = (bucket: Map<string, Observation[]>, unit: Named | null, parent: string | null, row: number) => {
    if (!unit) return;
    const list = bucket.get(unit.code) ?? [];
    list.push({ unit, parent, row });
    bucket.set(unit.code, list);
  };
  for (const row of rows) {
    add(fresh.province, row.newProvince, null, row.row);
    add(fresh.commune, row.newCommune, row.newProvince.code, row.row);
    add(old.province, row.oldProvince, null, row.row);
    add(old.district, row.oldDistrict, row.oldProvince?.code ?? null, row.row);
    add(old.commune, row.oldCommune, row.oldDistrict?.code ?? null, row.row);
  }
  const finish = (buckets: ReturnType<typeof make>): Collected => {
    const collected: Collected = { provinces: new Map(), districts: new Map(), communes: new Map(), conflicts: [] };
    collectLevel("province", buckets.province, collected.provinces, collected.conflicts);
    collectLevel("district", buckets.district, collected.districts, collected.conflicts);
    collectLevel("commune", buckets.commune, collected.communes, collected.conflicts);
    return collected;
  };
  return { newUnits: finish(fresh), oldUnits: finish(old) };
};
