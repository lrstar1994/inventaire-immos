import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const startedAt = new Date();
const started = performance.now();
const env = await loadSupabaseEnv();
const target = new URL(env.SUPABASE_DATABASE_URL);
if (target.port !== "6543") throw new Error("Port Transaction 6543 obligatoire.");
if (target.searchParams.get("sslmode") !== "require") throw new Error("sslmode=require obligatoire.");
if (target.searchParams.get("schema") !== "immos") throw new Error("schema=immos obligatoire.");
target.searchParams.set("pgbouncer", "true");
target.searchParams.set("connection_limit", "1");
target.searchParams.set("pool_timeout", "60");

const prisma = new PrismaClient({ datasourceUrl: target.toString(), errorFormat: "minimal" });
try {
  const [one] = await prisma.$queryRaw`SELECT 1::int AS value`;
  const [schema] = await prisma.$queryRaw`SELECT current_schema() AS schema`;
  const count = await prisma.assetFile.count();
  if (one?.value !== 1 || schema?.schema !== "immos" || count !== 0) throw new Error("Résultat Production inattendu.");
  console.log(JSON.stringify({ result: "PRODUCTION_RUNTIME_STABILITY_OK", startedAt: startedAt.toISOString(), durationMs: Math.round(performance.now() - started), port: 6543, schema: schema.schema, assetFileCount: count }));
} finally {
  await prisma.$disconnect();
}
