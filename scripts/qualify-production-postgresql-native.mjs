import { spawnSync } from "node:child_process";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const CHANNELS = Object.freeze({
  session: Object.freeze({ variable: "SUPABASE_DIRECT_URL", port: "5432" }),
  transaction: Object.freeze({ variable: "SUPABASE_DATABASE_URL", port: "6543" })
});
const channel = process.argv[2];
if (!CHANNELS[channel]) throw new Error("Canal attendu : session ou transaction.");

const env = await loadSupabaseEnv();
const contract = CHANNELS[channel];
const url = new URL(env[contract.variable]);
if (url.port !== contract.port) throw new Error(`Port ${contract.port} attendu.`);
if (url.searchParams.get("sslmode") !== "require") throw new Error("sslmode=require attendu.");
if (url.searchParams.get("schema") !== "immos") throw new Error("schema=immos attendu.");

const psql = "C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe";
const started = performance.now();
const result = spawnSync(psql, [
  "-X", "-w", "-v", "ON_ERROR_STOP=1", "-tA",
  "-h", url.hostname,
  "-p", url.port,
  "-U", decodeURIComponent(url.username),
  "-d", url.pathname.replace(/^\//, ""),
  "-c", "SELECT 1::int;"
], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: "require",
    PGOPTIONS: "-c search_path=immos"
  },
  encoding: "utf8",
  timeout: 60_000,
  windowsHide: true
});

const safeError = String(result.stderr || "")
  .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***")
  .replaceAll(url.hostname, "***");
console.log(JSON.stringify({
  result: result.status === 0 && String(result.stdout).trim() === "1" ? "NATIVE_SELECT_1_OK" : "NATIVE_SELECT_1_FAILED",
  channel,
  port: Number(url.port),
  sslmode: "require",
  schema: "immos",
  durationMs: Math.round(performance.now() - started),
  exitCode: result.status,
  timedOut: result.error?.code === "ETIMEDOUT",
  error: safeError || null
}, null, 2));
if (result.status !== 0 || String(result.stdout).trim() !== "1") process.exitCode = 1;
