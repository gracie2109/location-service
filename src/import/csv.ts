/** Parses RFC 4180 CSV (quoted fields, doubled quotes, CRLF, optional BOM) into rows of strings. */
export const parseCsv = (input: string): string[][] => {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("unterminated quoted field");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
};

export type CsvRecord = { line: number; values: Record<string, string> };

/** Header row plus records keyed by column name; `line` is the 1-based line of the record in the file. */
export const parseCsvRecords = (input: string): { header: string[]; records: CsvRecord[] } => {
  const rows = parseCsv(input);
  const header = (rows[0] ?? []).map((cell) => cell.trim());
  const records = rows.slice(1).map((cells, index) => ({
    line: index + 2,
    values: Object.fromEntries(header.map((name, column) => [name, (cells[column] ?? "").trim()])),
  }));
  return { header, records };
};
