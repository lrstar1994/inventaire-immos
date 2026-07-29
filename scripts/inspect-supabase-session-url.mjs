import { loadSupabaseEnv } from "./supabase-env.mjs";

const env = await loadSupabaseEnv();
const raw = env.SUPABASE_DIRECT_URL;
const url = new URL(raw);
let passwordEncodingValid = true;
try {
  decodeURIComponent(url.password);
} catch {
  passwordEncodingValid = false;
}
const usernameFormatValid = /^postgres\.[a-z0-9]+$/i.test(decodeURIComponent(url.username)) ||
  /^[a-z_][a-z0-9_]*\.[a-z0-9]+$/i.test(decodeURIComponent(url.username));
const checks = {
  protocolValid: ["postgresql:", "postgres:"].includes(url.protocol),
  sessionPoolerHost: /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/i.test(url.hostname),
  port5432: url.port === "5432",
  databasePostgres: url.pathname === "/postgres",
  usernameFormatValid,
  sslRequired: url.searchParams.get("sslmode") === "require",
  schemaImmos: url.searchParams.get("schema") === "immos",
  noWhitespace: !/\s/.test(raw),
  noEmbeddedQuotes: !/["']/.test(raw),
  noLineBreak: !/[\r\n]/.test(raw),
  passwordPresent: url.password.length > 0,
  passwordEncodingValid
};
const masked = `${url.protocol}//${decodeURIComponent(url.username).slice(0, 8)}…:***@${url.hostname}:${url.port}${url.pathname}?sslmode=${url.searchParams.get("sslmode")}&schema=${url.searchParams.get("schema")}`;
console.log(JSON.stringify({
  sourceFile: ".env.local",
  variable: "SUPABASE_DIRECT_URL",
  masked,
  checks,
  allValid: Object.values(checks).every(Boolean)
}, null, 2));
if (!Object.values(checks).every(Boolean)) process.exitCode = 2;
