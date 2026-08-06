import { loadSupabaseEnv } from "./supabase-env.mjs";

const env = await loadSupabaseEnv();
function inspect(name, raw) {
  const url = new URL(raw);
  const hostParts = url.hostname.split(".");
  const maskedHost = hostParts.length > 2
    ? `${hostParts[0].slice(0, 5)}-***.${hostParts.slice(-2).join(".")}`
    : "***";
  return {
    variable: name,
    masked: `${url.protocol}//${decodeURIComponent(url.username).slice(0, 3)}***:***@${maskedHost}:${url.port}${url.pathname}`,
    hostKind: url.hostname.includes("pooler.supabase.com") ? "Supabase pooler" : "direct/other",
    port: Number(url.port),
    database: url.pathname.replace(/^\//, ""),
    userMasked: `${decodeURIComponent(url.username).slice(0, 3)}***${decodeURIComponent(url.username).slice(-2)}`,
    passwordPresent: Boolean(url.password),
    sslmode: url.searchParams.get("sslmode"),
    schema: url.searchParams.get("schema"),
    pgbouncer: url.searchParams.get("pgbouncer"),
    connectionLimit: url.searchParams.get("connection_limit"),
    poolTimeout: url.searchParams.get("pool_timeout"),
    structurallyValid: ["postgresql:", "postgres:"].includes(url.protocol) &&
      url.searchParams.get("sslmode") === "require" &&
      !/\s|["']|[\r\n]/.test(raw)
  };
}
const sessionUrl = new URL(env.SUPABASE_DIRECT_URL);
const runtimeUrl = new URL(env.SUPABASE_DATABASE_URL);
console.log(JSON.stringify({
  session: inspect("SUPABASE_DIRECT_URL", env.SUPABASE_DIRECT_URL),
  runtime: inspect("SUPABASE_DATABASE_URL", env.SUPABASE_DATABASE_URL),
  sameHost: sessionUrl.hostname === runtimeUrl.hostname,
  sameDatabase: sessionUrl.pathname === runtimeUrl.pathname,
  sameProjectUser: decodeURIComponent(sessionUrl.username) === decodeURIComponent(runtimeUrl.username),
  directUrlAvailable: false
}, null, 2));
