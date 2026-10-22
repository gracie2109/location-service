import { parseArgs } from "node:util";
import { Pool } from "pg";
import { loadEnv } from "../config/env";
import { confirmAllExact, confirmProposal, rejectProposal, type Decision } from "../providers/ghn/decisions";
import { deactivateMapping, replaceMapping } from "../providers/ghn/lifecycle";
import { GhnClient } from "../providers/ghn/ghn-client";
import { runGhnSync, type GhnEnvironment } from "../providers/ghn/sync";

const USAGE = `Usage:
  node dist/cli/providers.js ghn sync --environment production|test [--apply]
  node dist/cli/providers.js ghn list [--status pending] [--reason exact_name|ambiguous|no_match] [--level province|commune] [--limit 100]
  node dist/cli/providers.js ghn confirm --environment production|test --code <ghn id> --unit <vn_...> --by <name>
  node dist/cli/providers.js ghn confirm --environment production|test --all-exact province|commune --by <name>
  node dist/cli/providers.js ghn reject --environment production|test --code <ghn id> --by <name>
  node dist/cli/providers.js ghn deactivate --code <ghn id> --by <name> --reason "<why>"
  node dist/cli/providers.js ghn replace --code <ghn id> --unit <vn_...> --by <name> --reason "<why>"

\`sync\` only sends GET requests to GHN. Without --apply it writes nothing. Provinces must be confirmed
before \`sync\` fetches their wards. Needs GHN_TOKEN and GHN_SHOP_ID in the environment.
\`--environment\` names the GHN gateway the token belongs to; GHN_BASE_URL must match it. A production mapping
replaces the test mapping of the same unit.`;

const fail = (message: string): never => {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exit(2);
};

const print = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

const printDecisions = (decisions: Decision[]): void => {
  for (const decision of decisions) process.stdout.write(`${decision.ok ? "ok  " : "fail"} ${decision.message}\n`);
  process.exitCode = decisions.every((decision) => decision.ok) ? 0 : 1;
};

const main = async (): Promise<void> => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      apply: { type: "boolean", default: false },
      status: { type: "string" },
      reason: { type: "string" },
      level: { type: "string" },
      limit: { type: "string" },
      code: { type: "string" },
      unit: { type: "string" },
      by: { type: "string" },
      "all-exact": { type: "string" },
      environment: { type: "string" },
    },
  });
  if (positionals[0] !== "ghn") fail("The only provider is `ghn`.");
  const command = positionals[1];

  const needsEnvironment = command === "sync" || command === "confirm" || command === "reject";
  if (needsEnvironment && values.environment !== "production" && values.environment !== "test") fail("--environment must be production or test");
  const environment = (values.environment ?? "test") as GhnEnvironment;

  const env = loadEnv();
  if (!env.DATABASE_URL) fail("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 2 });
  try {
    if (command === "sync") {
      if (!env.GHN_TOKEN || !env.GHN_SHOP_ID) fail("GHN_TOKEN and GHN_SHOP_ID must be set");
      if ((environment === "test") !== env.GHN_BASE_URL.includes("dev-online-gateway")) fail(`GHN_BASE_URL (${env.GHN_BASE_URL}) does not match --environment ${environment}`);
      const client = new GhnClient({ token: env.GHN_TOKEN ?? "", shopId: env.GHN_SHOP_ID ?? "", baseUrl: env.GHN_BASE_URL });
      const report = await runGhnSync(pool, client, values.apply, environment);
      print(report);
      process.exitCode = report.status === "failed" ? 1 : 0;
    } else if (command === "list") {
      const limit = Number(values.limit ?? 100);
      const rows = await pool.query(
        `select p.provider_code, p.level, p.provider_name, p.provider_parent_code, p.reason, p.suggested_code, p.candidate_codes, p.status,
                (select coalesce(jsonb_agg(jsonb_build_object('code', v.code, 'name', v.full_name) order by v.code), '[]'::jsonb)
                   from location.unit_versions v where v.valid_to is null and v.code = any (p.candidate_codes)) as candidates
           from location.provider_code_proposals p
          where p.provider = 'ghn' and p.status = $1 and ($2::text is null or p.reason = $2) and ($3::text is null or p.level = $3)
          order by p.level, p.provider_name limit $4`,
        [values.status ?? "pending", values.reason ?? null, values.level ?? null, Number.isInteger(limit) && limit > 0 ? limit : 100],
      );
      print(rows.rows);
    } else if (command === "confirm") {
      if (!values.by) fail("--by is required");
      if (values["all-exact"]) {
        const level = values["all-exact"];
        if (level !== "province" && level !== "commune") fail("--all-exact must be province or commune");
        printDecisions(await confirmAllExact(pool, level as "province" | "commune", values.by ?? "", environment));
      } else {
        if (!values.code || !values.unit) fail("--code and --unit are required");
        printDecisions([await confirmProposal(pool, values.code ?? "", values.unit ?? "", values.by ?? "", environment)]);
      }
    } else if (command === "reject") {
      if (!values.code || !values.by) fail("--code and --by are required");
      printDecisions([await rejectProposal(pool, values.code ?? "", values.by ?? "", environment)]);
    } else if (command === "deactivate") {
      if (!values.code || !values.by || !values.reason) fail("--code, --by and --reason are required");
      printDecisions([await deactivateMapping(pool, values.code ?? "", values.by ?? "", values.reason ?? "")]);
    } else if (command === "replace") {
      if (!values.code || !values.unit || !values.by || !values.reason) fail("--code, --unit, --by and --reason are required");
      printDecisions([await replaceMapping(pool, values.code ?? "", values.unit ?? "", values.by ?? "", values.reason ?? "")]);
    } else {
      fail("Unknown command.");
    }
  } finally {
    await pool.end();
  }
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "command failed"}\n`);
  process.exit(1);
});
