import { parseArgs } from "node:util";
import { Pool } from "pg";
import { generateApiKey, isScope } from "../auth/api-key";
import { loadEnv } from "../config/env";

const USAGE = `Usage:
  node dist/cli/api-keys.js create --name <client> --scopes catalog:snapshot,provider-codes:read [--rate-limit 120]
  node dist/cli/api-keys.js revoke --name <client>
  node dist/cli/api-keys.js list

The key is printed once by \`create\` and cannot be shown again; only a hash is stored.`;

const fail = (message: string): never => {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exit(2);
};

const main = async (): Promise<void> => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { name: { type: "string" }, scopes: { type: "string" }, "rate-limit": { type: "string" } },
  });
  const command = positionals[0];
  const { DATABASE_URL } = loadEnv();
  if (!DATABASE_URL) fail("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  try {
    if (command === "create") {
      if (!values.name) fail("--name is required");
      const scopes = (values.scopes ?? "").split(",").map((scope) => scope.trim()).filter(Boolean);
      if (scopes.length === 0 || !scopes.every(isScope)) fail("--scopes must list catalog:snapshot and/or provider-codes:read");
      const rate = values["rate-limit"] === undefined ? 120 : Number(values["rate-limit"]);
      if (!Number.isInteger(rate) || rate < 1 || rate > 6000) fail("--rate-limit must be a whole number from 1 to 6000");
      const { key, prefix, hash } = generateApiKey();
      await pool.query(
        "insert into location.api_clients (name, key_prefix, key_hash, scopes, rate_limit_per_min) values ($1, $2, $3, $4, $5)",
        [values.name, prefix, hash, scopes, rate],
      );
      process.stdout.write(`Client "${values.name}" created. Store this key now; it is not shown again:\n${key}\n`);
    } else if (command === "revoke") {
      if (!values.name) fail("--name is required");
      const result = await pool.query("update location.api_clients set revoked_at = now() where name = $1 and revoked_at is null", [values.name]);
      process.stdout.write(result.rowCount ? `Client "${values.name}" revoked.\n` : `No live client named "${values.name}".\n`);
      process.exitCode = result.rowCount ? 0 : 1;
    } else if (command === "list") {
      const result = await pool.query(
        "select name, key_prefix, scopes, rate_limit_per_min, created_at, revoked_at from location.api_clients order by name",
      );
      process.stdout.write(`${JSON.stringify(result.rows, null, 2)}\n`);
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
