import { loadSupabaseEnv } from "./supabase-env.mjs";

const env = await loadSupabaseEnv();
function inspect(name, raw) {
  const url = new URL(raw);
  return {
    variable: name,
    masked: `${url.protocol}//${decodeURIComponent(url.username).slice(0, 8)}…:***@${url.hostname}:${url.port}${url.pathname}`,
    hostKind: url.hostname.includes("pooler.supabase.com") ? "Supabase pooler" : "direct/other",
    port: Number(url.port),
    sslmode: url.searchParams.get("sslmode"),
    schema: url.searchParams.get("schema"),
    pgbouncer: url.searchParams.get("pgbouncer"),
    structurallyValid: ["postgresql:", "postgres:"].includes(url.protocol) &&
      url.searchParams.get("sslmode") === "require" &&
      !/\s|["']|[\r\n]/.test(raw)
  };
}
console.log(JSON.stringify({
  session: inspect("SUPABASE_DIRECT_URL", env.SUPABASE_DIRECT_URL),
  runtime: inspect("SUPABASE_DATABASE_URL", env.SUPABASE_DATABASE_URL),
  directUrlAvailable: false
}, null, 2));
