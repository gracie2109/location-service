import { UNIT_TYPES, type UnitType } from "../catalog/types";
import { parseCsvRecords } from "./csv";
import type { FileIssue, ImportLevel, ParsedUnit } from "./types";

const FILE = "units";
const REQUIRED = ["level", "official_code", "unit_type", "name", "full_name", "parent_official_code"];
const OPTIONAL = ["name_en", "full_name_en", "en_names_source", "centroid_lat", "centroid_lon", "centroid_source"];

const TYPES_BY_LEVEL: Record<ImportLevel, UnitType[]> = {
  province: ["province", "municipality"],
  commune: ["ward", "commune", "special_zone"],
};
const CODE_PATTERN: Record<ImportLevel, RegExp> = { province: /^[0-9]{2}$/, commune: /^[0-9]{5}$/ };

const number = (text: string): number | null => (text !== "" && Number.isFinite(Number(text)) ? Number(text) : null);

/** Reads the units CSV; every problem is reported with its line, nothing is thrown for bad data. */
export const parseUnitsFile = (text: string): { units: ParsedUnit[]; issues: FileIssue[] } => {
  const issues: FileIssue[] = [];
  const problem = (line: number | null, message: string) => issues.push({ file: FILE, line, message });

  let parsed: ReturnType<typeof parseCsvRecords>;
  try {
    parsed = parseCsvRecords(text);
  } catch (error) {
    problem(null, error instanceof Error ? error.message : "unreadable file");
    return { units: [], issues };
  }

  for (const column of REQUIRED) if (!parsed.header.includes(column)) problem(1, `missing column ${column}`);
  for (const column of parsed.header) if (![...REQUIRED, ...OPTIONAL].includes(column)) problem(1, `unknown column ${column}`);
  if (issues.length > 0) return { units: [], issues };
  if (parsed.records.length === 0) problem(null, "the file has no rows");

  const units: ParsedUnit[] = [];
  const seen = new Map<string, number>();

  for (const { line, values } of parsed.records) {
    const before = issues.length;
    const level = values.level as ImportLevel;
    if (level !== "province" && level !== "commune") {
      problem(line, `level must be province or commune, got "${values.level}"`);
      continue;
    }
    const officialCode = values.official_code ?? "";
    if (!CODE_PATTERN[level].test(officialCode)) problem(line, `official_code "${officialCode}" is not ${level === "province" ? "2" : "5"} digits`);
    const unitType = values.unit_type as UnitType;
    if (!UNIT_TYPES.includes(unitType) || !TYPES_BY_LEVEL[level].includes(unitType)) {
      problem(line, `unit_type "${values.unit_type}" is not valid for level ${level}`);
    }
    if (!values.name) problem(line, "name is empty");
    if (!values.full_name) problem(line, "full_name is empty");

    const parent = values.parent_official_code || null;
    if (level === "province" && parent) problem(line, "a province has no parent");
    if (level === "commune" && !parent) problem(line, "a commune needs parent_official_code");
    if (parent && !CODE_PATTERN.province.test(parent)) problem(line, `parent_official_code "${parent}" is not a province code`);

    const key = `${level}:${officialCode}`;
    const first = seen.get(key);
    if (first !== undefined) problem(line, `official_code ${officialCode} is repeated (first at line ${first})`);
    else seen.set(key, line);

    const nameEn = values.name_en || null;
    const fullNameEn = values.full_name_en || null;
    const source = values.en_names_source || null;
    if (source !== null && source !== "derived" && source !== "official") problem(line, `en_names_source must be derived or official, got "${source}"`);
    if ((nameEn || fullNameEn) && !source) problem(line, "English names need en_names_source");

    const lat = values.centroid_lat ? number(values.centroid_lat) : null;
    const lon = values.centroid_lon ? number(values.centroid_lon) : null;
    if (Boolean(values.centroid_lat) !== Boolean(values.centroid_lon)) problem(line, "centroid_lat and centroid_lon go together");
    if (values.centroid_lat && (lat === null || lat < -90 || lat > 90)) problem(line, "centroid_lat must be between -90 and 90");
    if (values.centroid_lon && (lon === null || lon < -180 || lon > 180)) problem(line, "centroid_lon must be between -180 and 180");
    if (lat !== null && !values.centroid_source) problem(line, "a centroid needs centroid_source");

    if (issues.length > before) continue;
    units.push({
      line,
      level,
      officialCode,
      unitType,
      name: values.name ?? "",
      fullName: values.full_name ?? "",
      parentOfficialCode: parent,
      nameEn,
      fullNameEn,
      enNamesSource: source as ParsedUnit["enNamesSource"],
      centroid: lat !== null && lon !== null ? { latitude: lat, longitude: lon } : null,
      centroidSource: values.centroid_source || null,
    });
  }
  return { units, issues };
};
