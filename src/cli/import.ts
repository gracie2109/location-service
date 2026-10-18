import { parseArgs } from "node:util";
import { Pool } from "pg";
import { loadEnv } from "../config/env";
import { runImport, type ImportOptions } from "../import/run-import";

const USAGE = `Usage: node dist/cli/import.js catalog --units <units.csv> [--successions <successions.csv>]
  --source gso|legacy_gso|fixture --source-ref <text> --effective-on YYYY-MM-DD --extracted-at <ISO time>
  [--id <catalog version id>] [--expect-provinces N] [--expect-districts N] [--expect-communes N]
  [--retire-level district]
  [--retire-without-successor] [--apply]

Without --apply nothing is written: the import runs in a transaction that is rolled back and the report shows what would change.`;

const fail = (message: string): never => {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exit(2);
};

const optionalInt = (value: string | undefined, name: string): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fail(`${name} must be a whole number`);
};

const main = async (): Promise<void> => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      units: { type: "string" },
      successions: { type: "string" },
      source: { type: "string" },
      "source-ref": { type: "string" },
      "effective-on": { type: "string" },
      "extracted-at": { type: "string" },
      id: { type: "string" },
      "expect-provinces": { type: "string" },
      "expect-districts": { type: "string" },
      "expect-communes": { type: "string" },
      "retire-level": { type: "string", multiple: true },
      "retire-without-successor": { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
    },
  });
  if (positionals[0] !== "catalog") fail("The only command is `catalog`.");
  if (!values.units) fail("--units is required");
  if (values.source !== "gso" && values.source !== "legacy_gso" && values.source !== "fixture") fail("--source must be gso, legacy_gso or fixture");
  if (!values["source-ref"]) fail("--source-ref is required");
  if (!values["effective-on"] || !/^\d{4}-\d{2}-\d{2}$/.test(values["effective-on"])) fail("--effective-on must be YYYY-MM-DD");
  const extractedAt = values["extracted-at"] ? new Date(values["extracted-at"]) : new Date(Number.NaN);
  if (Number.isNaN(extractedAt.getTime())) fail("--extracted-at must be a date and time, for example 2026-10-20T09:00:00+07:00");

  const { DATABASE_URL } = loadEnv();
  if (!DATABASE_URL) fail("DATABASE_URL is not set");

  const options: ImportOptions = {
    unitsFile: values.units ?? "",
    successionsFile: values.successions,
    source: values.source as ImportOptions["source"],
    sourceRef: values["source-ref"] ?? "",
    effectiveOn: values["effective-on"] ?? "",
    extractedAt: extractedAt.toISOString(),
    catalogId: values.id,
    apply: values.apply,
    retireWithoutSuccessor: values["retire-without-successor"],
    expectProvinces: optionalInt(values["expect-provinces"], "--expect-provinces"),
    retireLevels: values["retire-level"],
    expectDistricts: optionalInt(values["expect-districts"], "--expect-districts"),
    expectCommunes: optionalInt(values["expect-communes"], "--expect-communes"),
  };

  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  try {
    const report = await runImport(pool, options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.status === "failed" ? 1 : 0;
  } finally {
    await pool.end();
  }
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "import failed"}\n`);
  process.exit(1);
});
