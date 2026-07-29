import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const EXPECTED_SCHEMA = "immos_recipe_phase8";
const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
url.searchParams.set("schema", EXPECTED_SCHEMA);
if (url.port !== "5432" || url.searchParams.get("sslmode") !== "require") {
  throw new Error("Connexion refusée : port session 5432 et sslmode=require obligatoires.");
}

const results = [];
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });
  const startedAt = Date.now();
  try {
    const one = await prisma.$queryRawUnsafe("SELECT 1 AS value");
    const database = await prisma.$queryRawUnsafe("SELECT current_database() AS value");
    const schema = await prisma.$queryRawUnsafe("SELECT current_schema() AS value");
    const result = {
      attempt,
      selectOne: one[0]?.value === 1,
      databasePresent: Boolean(database[0]?.value),
      schema: schema[0]?.value,
      durationMs: Date.now() - startedAt
    };
    results.push(result);
    if (!result.selectOne || !result.databasePresent || result.schema !== EXPECTED_SCHEMA) {
      throw new Error(`Test ${attempt} non conforme.`);
    }
  } finally {
    await prisma.$disconnect();
  }
  if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 3000));
}

console.log(JSON.stringify({
  result: "STABLE",
  endpoint: { protocol: url.protocol.replace(":", ""), port: Number(url.port), schema: EXPECTED_SCHEMA, sslmode: "require" },
  attempts: results
}, null, 2));
