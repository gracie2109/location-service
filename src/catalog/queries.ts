import { versionOn, versionToShow, todayInVietnam } from "./as-of";
import { normalizeText, stripLeadingTypeWord, trigramSimilarity } from "./normalize";
import type { Level, Snapshot, UnitType, UnitVersion } from "./types";
import { provinceOf } from "./views";

const COLLATOR = new Intl.Collator("vi");
const MIN_SIMILARITY = 0.35;
const MAX_SIMILARITY_SCORE = 0.6;

export type SortKey = "name" | "official_code";

const byOfficialCode = (a: UnitVersion, b: UnitVersion): number =>
  (a.officialCode ?? "￿").localeCompare(b.officialCode ?? "￿") || a.code.localeCompare(b.code);

const byName = (a: UnitVersion, b: UnitVersion): number =>
  COLLATOR.compare(a.name, b.name) || COLLATOR.compare(a.fullName, b.fullName) || a.code.localeCompare(b.code);

const sorter = (sort: SortKey) => (sort === "official_code" ? byOfficialCode : byName);

/** The version of every unit that was in force on `date`. */
const inForceOn = (snapshot: Snapshot, date: string): UnitVersion[] => {
  const result: UnitVersion[] = [];
  for (const versions of snapshot.byCode.values()) {
    const version = versionOn(versions, date);
    if (version) result.push(version);
  }
  return result;
};

export const listProvinces = (snapshot: Snapshot, asOf: string | undefined, sort: SortKey): UnitVersion[] =>
  inForceOn(snapshot, asOf ?? todayInVietnam())
    .filter((version) => version.level === "province")
    .sort(sorter(sort));

export type CommuneFilter = { asOf?: string; q?: string; unitTypes?: UnitType[]; sort: SortKey };

/** Communes of a province on a date. Historical communes hang under districts, so the province is found through them. */
export const listCommunes = (snapshot: Snapshot, provinceCode: string, filter: CommuneFilter): UnitVersion[] => {
  const date = filter.asOf ?? todayInVietnam();
  const needle = filter.q ? normalizeText(filter.q) : "";
  return inForceOn(snapshot, date)
    .filter((version) => version.level === "commune")
    .filter((version) => !filter.unitTypes || filter.unitTypes.includes(version.unitType))
    .filter((version) => provinceOf(snapshot, version, date)?.code === provinceCode)
    .filter((version) => !needle || version.fullKey.includes(needle))
    .sort(sorter(filter.sort));
};

const matchScore = (query: string, key: string): number => {
  if (!query || !key) return 0;
  if (key === query) return 1;
  if (key.startsWith(query)) return 0.9;
  if (` ${key}`.includes(` ${query}`)) return 0.8;
  if (key.includes(query)) return 0.7;
  const similarity = trigramSimilarity(query, key);
  return similarity >= MIN_SIMILARITY ? Math.min(similarity, 1) * MAX_SIMILARITY_SCORE : 0;
};

/** Best of: the whole query against the full name, and the query without its type word against the bare name. */
export const scoreVersion = (version: UnitVersion, query: string): number => {
  const normalized = normalizeText(query);
  const score = Math.max(
    matchScore(normalized, version.fullKey),
    matchScore(stripLeadingTypeWord(normalized), version.nameKey),
  );
  return Math.round(score * 1000) / 1000;
};

export type SearchFilter = { q: string; levels?: Level[]; provinceCode?: string; includeRetired: boolean };
export type SearchMatch = { version: UnitVersion; score: number };

export const searchUnits = (snapshot: Snapshot, filter: SearchFilter): SearchMatch[] => {
  const matches: SearchMatch[] = [];
  for (const versions of snapshot.byCode.values()) {
    const version = versionToShow(versions);
    if (!version) continue;
    if (!filter.includeRetired && version.validTo !== null) continue;
    if (filter.levels && !filter.levels.includes(version.level)) continue;
    if (filter.provinceCode && provinceOf(snapshot, version)?.code !== filter.provinceCode) continue;
    const score = scoreVersion(version, filter.q);
    if (score > 0) matches.push({ version, score });
  }
  return matches.sort((a, b) => b.score - a.score || byName(a.version, b.version));
};
