import { spawnSync } from "node:child_process";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
const psql = "C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe";
const sql = [
  "SELECT 1;",
  "SELECT current_database();",
  "SELECT current_user;",
  "SELECT current_schema();"
].join(" ");
const started = performance.now();
const result = spawnSync(psql, [
  "-X", "-w", "-v", "ON_ERROR_STOP=1", "-tA",
  "-h", url.hostname,
  "-p", url.port,
  "-U", decodeURIComponent(url.username),
  "-d", url.pathname.replace(/^\//, ""),
  "-c", sql
], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode")
  },
  encoding: "utf8",
  timeout: 60000,
  windowsHide: true
});
const durationMs = Math.round(performance.now() - started);
const output = String(result.stdout || "").trim().split(/\r?\n/);
const maskedOutput = output.map((value, index) => index === 2
  ? `${value.slice(0, 3)}***${value.slice(-2)}`
  : value
);
const report = {
  attemptCount: 1,
  exitCode: result.status,
  signal: result.signal,
  durationMs,
  timedOut: result.error?.code === "ETIMEDOUT",
  stdout: maskedOutput,
  stderr: String(result.stderr || "").trim()
};
console.log(JSON.stringify(report, null, 2));
if (result.status !== 0) process.exitCode = result.status || 1;
