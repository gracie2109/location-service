import { normalizeText } from "./normalize";
import type { CatalogInfo, Snapshot, Succession, UnitVersion } from "./types";

type RawUnitVersion = Omit<UnitVersion, "nameKey" | "fullKey">;

const pushTo = <T>(map: Map<string, T[]>, key: string, value: T): void => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

/** Builds the in-memory snapshot; computes matching keys and orders each unit's versions by date. */
export const buildSnapshot = (
  catalog: CatalogInfo,
  versions: CatalogInfo[],
  rows: RawUnitVersion[],
  successions: Succession[],
): Snapshot => {
  const byCode = new Map<string, UnitVersion[]>();
  for (const row of rows) {
    pushTo(byCode, row.code, { ...row, nameKey: normalizeText(row.name), fullKey: normalizeText(row.fullName) });
  }
  for (const list of byCode.values()) list.sort((a, b) => a.validFrom.localeCompare(b.validFrom));

  const successionsFrom = new Map<string, Succession[]>();
  const successionsTo = new Map<string, Succession[]>();
  for (const succession of successions) {
    pushTo(successionsFrom, succession.fromCode, succession);
    pushTo(successionsTo, succession.toCode, succession);
  }
  return { catalog, versions, byCode, successionsFrom, successionsTo };
};
