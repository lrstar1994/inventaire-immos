import { PrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DATABASE_URL);
if (url.port !== "6543" || !url.hostname.includes("pooler.supabase.com")) {
  throw new Error("SUPABASE_DATABASE_URL n'est pas le pooler Transaction 6543 attendu.");
}
url.searchParams.set("schema", "immos_recipe_phase8");
url.searchParams.set("pgbouncer", "true");
url.searchParams.set("connection_limit", "1");
const started = performance.now();
const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });
try {
  const [one] = await prisma.$queryRaw`SELECT 1::int AS value`;
  console.log(JSON.stringify({
    attemptCount: 1,
    client: "generated/prisma-recipe",
    mode: "Supabase pooler transaction",
    port: 6543,
    pgbouncer: true,
    selectOne: one.value,
    durationMs: Math.round(performance.now() - started)
  }, null, 2));
  if (one.value !== 1) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
