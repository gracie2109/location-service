import ExcelJS from "exceljs";
import { cleanText } from "./gso-text";
import { FIELDS, type Field, type RawRow } from "./gso-rows";

const SHEET_INDEX = 1;
const FIRST_DATA_ROW = 3;

const text = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "richText" in value) return value.richText.map((part) => part.text).join("");
  if (typeof value === "object" && "result" in value) return String(value.result ?? "");
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

/** Reads sheet 2 ("Tổng hợp_không merge"): one RawRow per data row, with Excel row numbers. Banner rows (province headings) are skipped. */
export const readWorkbook = async (path: string): Promise<RawRow[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.worksheets[SHEET_INDEX];
  if (!sheet) throw new Error("the workbook has no second sheet");
  const rows: RawRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < FIRST_DATA_ROW) return;
    const cells = Object.fromEntries(FIELDS.map((field, index) => [field, cleanText(text(row.getCell(index + 1).value))])) as Record<Field, string>;
    if (cells.new_name === "" && cells.new_code === "") return;
    rows.push({ row: rowNumber, cells });
  });
  return rows;
};
