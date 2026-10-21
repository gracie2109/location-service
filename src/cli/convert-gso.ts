import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { convertGso } from "../convert/gso-conversion";
import { successionsCsv, unitsCsv } from "../convert/gso-output";
import { parseCorrections } from "../convert/gso-rows";
import { readWorkbook } from "../convert/gso-workbook";

const USAGE = `Usage: node dist/cli/convert-gso.js --xlsx <file> --corrections <corrections.csv> --out <directory>

Writes legacy-units.csv, units.csv, successions.csv and report.json. Exit code 1 when the report has errors.`;

const main = async (): Promise<void> => {
  const { values } = parseArgs({ options: { xlsx: { type: "string" }, corrections: { type: "string" }, out: { type: "string" } } });
  if (!values.xlsx || !values.corrections || !values.out) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  const parsed = parseCorrections(await readFile(values.corrections, "utf8"));
  const conversion = convertGso(await readWorkbook(values.xlsx), parsed.corrections);
  conversion.report.errors.unshift(...parsed.issues);

  await mkdir(values.out, { recursive: true });
  await writeFile(join(values.out, "legacy-units.csv"), unitsCsv(conversion.legacyUnits));
  await writeFile(join(values.out, "units.csv"), unitsCsv(conversion.currentUnits));
  await writeFile(join(values.out, "successions.csv"), successionsCsv(conversion.successions));
  await writeFile(join(values.out, "report.json"), `${JSON.stringify(conversion.report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ counts: conversion.report.counts, errors: conversion.report.errors.length, warnings: conversion.report.warnings.length }, null, 2)}\n`);
  process.exitCode = conversion.report.errors.length > 0 ? 1 : 0;
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "conversion failed"}\n`);
  process.exit(1);
});
