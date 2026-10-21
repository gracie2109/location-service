import type { UnitType } from "../catalog/types";
import type { ImportLevel } from "../import/types";

/** Type words that start an administrative unit's full name, longest first, with the unit type each means per level. */
const PREFIXES: { word: string; types: Partial<Record<ImportLevel, UnitType>> }[] = [
  { word: "Thành phố", types: { province: "municipality", district: "provincial_city" } },
  { word: "Thị trấn", types: { commune: "township" } },
  { word: "Thị xã", types: { district: "town" } },
  { word: "Đặc khu", types: { commune: "special_zone" } },
  { word: "Quận", types: { district: "urban_district" } },
  { word: "Huyện", types: { district: "rural_district" } },
  { word: "Phường", types: { commune: "ward" } },
  { word: "Tỉnh", types: { province: "province" } },
  { word: "Xã", types: { commune: "commune" } },
];

/** Cell text with whitespace collapsed and Unicode composed, so equal-looking text compares equal. */
export const cleanText = (value: string): string => value.normalize("NFC").replace(/\s+/g, " ").trim();

/** "Thành phố Hà Nội (01)" → name and the digits in brackets; null when the text has no bracketed code. */
export const splitCoded = (text: string): { full: string; code: string } | null => {
  const match = /^(.*\S)\s*\((\d+)\)$/.exec(cleanText(text));
  return match && match[1] !== undefined && match[2] !== undefined ? { full: match[1], code: match[2] } : null;
};

export type ParsedName = { unitType: UnitType; name: string; fullName: string };

/** Splits a full name into canonical type word and name. Null when it does not start with a type word valid for the level. */
export const parseFullName = (text: string, level: ImportLevel): ParsedName | null => {
  const cleaned = cleanText(text);
  const lower = cleaned.toLowerCase();
  for (const prefix of PREFIXES) {
    const word = prefix.word.toLowerCase();
    const type = prefix.types[level];
    if (!type || !lower.startsWith(`${word} `)) continue;
    const name = cleaned.slice(word.length + 1).trim();
    if (name === "") return null;
    return { unitType: type, name, fullName: `${prefix.word} ${name}` };
  }
  return null;
};

/** Digits padded with zeros to the width of the level's official code (the workbook lost leading zeros). */
export const padCode = (digits: string, width: number): string => digits.padStart(width, "0");

export const CODE_WIDTH: Record<ImportLevel, number> = { province: 2, district: 3, commune: 5 };
