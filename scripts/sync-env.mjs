import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const envFile = process.argv[2] ?? ".env.prod";
const repo = process.env.GITHUB_REPOSITORY || "mauricekuehl/beachvolleyball-entry-estimator";
const vercelEnvironment = process.env.VERCEL_ENVIRONMENT || "production";

const vercelKeys = [
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "RESEND_FROM_NAME",
  "APP_BASE_URL",
  "CRON_SECRET",
];
const githubKeys = ["APP_BASE_URL", "CRON_SECRET"];
const optionalVercelKeys = new Set(["RESEND_FROM_NAME"]);

const values = parseDotenv(readFileSync(envFile, "utf8"));
const missing = vercelKeys.filter((key) => !optionalVercelKeys.has(key) && !values[key]);

if (missing.length > 0) {
  console.error(`Missing required values in ${envFile}: ${missing.join(", ")}`);
  process.exit(1);
}

for (const key of vercelKeys) {
  if (!values[key]) continue;

  run(
    "npx",
    ["vercel@latest", "env", "add", key, vercelEnvironment, "--force", "--sensitive", "--yes"],
    values[key],
  );
  console.log(`Synced Vercel ${vercelEnvironment} env: ${key}`);
}

for (const key of githubKeys) {
  run("gh", ["secret", "set", key, "--repo", repo, "--app", "actions"], values[key]);
  console.log(`Synced GitHub Actions secret: ${key}`);
}

console.log("Done. Redeploy Vercel for updated production runtime variables to take effect.");

function run(command, args, input) {
  const result = spawnSync(command, args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    console.error(`Command failed: ${command} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

function parseDotenv(source) {
  const values = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    values[key] = unquote(rawValue.trim());
  }

  return values;
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  const hashIndex = value.indexOf(" #");
  return hashIndex >= 0 ? value.slice(0, hashIndex).trim() : value;
}
