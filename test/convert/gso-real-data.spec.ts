import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { convertGso } from "../../src/convert/gso-conversion";
import { successionsCsv, unitsCsv } from "../../src/convert/gso-output";
import { parseCorrections } from "../../src/convert/gso-rows";
import { readWorkbook } from "../../src/convert/gso-workbook";

const DIR = join(__dirname, "../../data/gso/2025-07-01");
const WORKBOOK = join(DIR, "BangChuyendoi_VHCmoi_cu_final.xlsx");
const describeData = existsSync(WORKBOOK) ? describe : describe.skip;

/** Guards the committed CSVs: they must be exactly what the converter produces from the committed workbook and corrections. */
describeData("the committed GSO data", () => {
  jest.setTimeout(60_000);

  it("is what the converter produces, with no errors and the expected counts", async () => {
    const { corrections, issues } = parseCorrections(await readFile(join(DIR, "corrections.csv"), "utf8"));
    expect(issues).toEqual([]);
    const result = convertGso(await readWorkbook(WORKBOOK), corrections);

    expect(result.report.errors).toEqual([]);
    expect(result.report.counts.legacy).toEqual({ provinces: 63, districts: 696, communes: 10030 });
    expect(result.report.counts.current).toEqual({ provinces: 34, communes: 3321 });
    expect(result.report.conflicts.map((c) => c.code)).toEqual(["00553", "01615", "02485"]);

    expect(unitsCsv(result.legacyUnits)).toBe(await readFile(join(DIR, "legacy-units.csv"), "utf8"));
    expect(unitsCsv(result.currentUnits)).toBe(await readFile(join(DIR, "units.csv"), "utf8"));
    expect(successionsCsv(result.successions)).toBe(await readFile(join(DIR, "successions.csv"), "utf8"));
    expect(`${JSON.stringify(result.report, null, 2)}\n`).toBe(await readFile(join(DIR, "report.json"), "utf8"));
  });
});
