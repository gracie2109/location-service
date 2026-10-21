import { parseCsvRecords } from "../import/csv";
import { cleanText, CODE_WIDTH, padCode, parseFullName, splitCoded, type ParsedName } from "./gso-text";

/** The eight columns of the workbook, in order, as they are in the file. */
export const FIELDS = ["new_province", "new_name", "new_code", "old_name", "old_code", "note", "old_district", "old_province"] as const;
export type Field = (typeof FIELDS)[number];
export type RawRow = { row: number; cells: Record<Field, string> };

export type Correction = { row: number; field: Field; expected: string; replacement: string; reason: string };

/** How a row's note says the old unit relates to the new one. */
export type NoteKind = "whole" | "partial" | "remainder" | "district_to_special_zone";

/** `bare` is set when a province name had no type word; the units step takes the prefixed spelling from another row of the same code. */
export type Named = ParsedName & { code: string; bare?: boolean };
export type SourceRow = {
  row: number;
  note: string;
  kind: NoteKind;
  newProvince: Named;
  newCommune: Named;
  oldCommune: Named | null;
  oldDistrict: Named | null;
  oldProvince: Named | null;
};

export const classifyNote = (note: string): NoteKind | null => {
  if (/^Sắp xếp toàn bộ huyện/i.test(note)) return "district_to_special_zone";
  if (/^Phần còn lại/i.test(note)) return "remainder";
  if (/m[ộo]t ph[ầa]n/i.test(note)) return "partial";
  if (/^(Nhập toàn bộ|Giữ nguyên|Đổi tên|Đổi loại hình|Sắp xếp toàn bộ xã)/i.test(note)) return "whole";
  return null;
};

/** Reads corrections.csv. Each fixes one cell of the source and must say what it expects to replace. */
export const parseCorrections = (text: string): { corrections: Correction[]; issues: string[] } => {
  const issues: string[] = [];
  const { header, records } = parseCsvRecords(text);
  for (const column of ["row", "field", "expected", "replacement", "reason"]) if (!header.includes(column)) issues.push(`corrections: missing column ${column}`);
  if (issues.length > 0) return { corrections: [], issues };
  const corrections: Correction[] = [];
  for (const { line, values } of records) {
    const row = Number(values.row);
    const field = values.field as Field;
    if (!Number.isInteger(row) || !FIELDS.includes(field) || !values.reason) {
      issues.push(`corrections line ${line}: needs an integer row, a known field and a reason`);
      continue;
    }
    corrections.push({ row, field, expected: values.expected ?? "", replacement: values.replacement ?? "", reason: values.reason });
  }
  return { corrections, issues };
};

/** Applies corrections to cleaned cells; a correction whose expected text is not what the cell holds is an issue, never applied. */
export const applyCorrections = (rows: RawRow[], corrections: Correction[]): { rows: RawRow[]; issues: string[]; applied: number } => {
  const byRow = new Map(rows.map((row) => [row.row, { row: row.row, cells: { ...row.cells } }]));
  const issues: string[] = [];
  let applied = 0;
  for (const fix of corrections) {
    const target = byRow.get(fix.row);
    if (!target) {
      issues.push(`correction for row ${fix.row}: the row is not in the data`);
    } else if (target.cells[fix.field] !== cleanText(fix.expected)) {
      issues.push(`correction for row ${fix.row} ${fix.field}: expected "${fix.expected}" but the file has "${target.cells[fix.field]}"`);
    } else {
      target.cells[fix.field] = cleanText(fix.replacement);
      applied += 1;
    }
  }
  return { rows: [...byRow.values()], issues, applied };
};

const named = (text: string, level: "province" | "district" | "commune", codeText: string | null, issues: string[], row: number, label: string): Named | null => {
  const coded = codeText === null ? splitCoded(text) : { full: text, code: codeText };
  if (!coded || !/^\d+$/.test(coded.code)) {
    issues.push(`row ${row}: ${label} "${text}" has no code`);
    return null;
  }
  const parsed = parseFullName(coded.full, level);
  if (!parsed && level === "province") {
    const name = cleanText(coded.full);
    return { unitType: "province", name, fullName: name, code: padCode(coded.code, CODE_WIDTH[level]), bare: true };
  }
  if (!parsed) {
    issues.push(`row ${row}: ${label} "${coded.full}" does not start with a type word valid for a ${level}`);
    return null;
  }
  return { ...parsed, code: padCode(coded.code, CODE_WIDTH[level]) };
};

/** Turns cleaned cells into typed rows. Problems are collected with the row number, never thrown. */
export const parseRows = (rows: RawRow[]): { rows: SourceRow[]; issues: string[] } => {
  const issues: string[] = [];
  const result: SourceRow[] = [];
  for (const { row, cells } of rows) {
    const before = issues.length;
    const kind = classifyNote(cells.note);
    if (!kind) issues.push(`row ${row}: unknown note "${cells.note}"`);
    const newProvince = named(cells.new_province, "province", null, issues, row, "new province");
    const newCommune = named(cells.new_name, "commune", cells.new_code, issues, row, "new commune");
    const oldCommune = cells.old_code ? named(cells.old_name, "commune", cells.old_code, issues, row, "old commune") : null;
    const oldDistrict = cells.old_district ? named(splitCoded(cells.old_district)?.full ?? cells.old_district, "district", splitCoded(cells.old_district)?.code ?? null, issues, row, "old district") : null;
    const oldProvince = cells.old_province ? named(cells.old_province, "province", null, issues, row, "old province") : null;
    if (kind && newProvince && newCommune && issues.length === before) result.push({ row, note: cells.note, kind, newProvince, newCommune, oldCommune, oldDistrict, oldProvince });
  }
  return { rows: result, issues };
};
