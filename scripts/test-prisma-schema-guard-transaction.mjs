import { PrismaClient } from "../generated/prisma-recipe/index.js";
import { assertExpectedSchema } from "../lib/schema-guard.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
url.searchParams.set("schema", "immos_recipe_phase8");
if (url.port !== "5432" || url.searchParams.get("sslmode") !== "require") {
  throw new Error("Le diagnostic exige Supavisor Session 5432 avec sslmode=require.");
}
const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });

async function run(expectedSchema) {
  const callStartedAt = performance.now();
  let transactionStartedAt;
  let guardMs;
  let selectOneMs;
  try {
    await prisma.$transaction(async (tx) => {
      transactionStartedAt = performance.now();
      const guardStartedAt = performance.now();
      await assertExpectedSchema(tx, expectedSchema, "recipe");
      guardMs = Math.round(performance.now() - guardStartedAt);
      const selectStartedAt = performance.now();
      await tx.$queryRaw`SELECT 1::int AS value`;
      selectOneMs = Math.round(performance.now() - selectStartedAt);
    }, { maxWait: 10000, timeout: 30000 });
    const completedAt = performance.now();
    return {
      expectedSchema,
      result: "COMMIT",
      acquisitionMs: Math.round(transactionStartedAt - callStartedAt),
      guardMs,
      selectOneMs,
      transactionMs: Math.round(completedAt - transactionStartedAt),
      transactionCallMs: Math.round(completedAt - callStartedAt)
    };
  } catch (error) {
    const completedAt = performance.now();
    return {
      expectedSchema,
      result: "ROLLBACK",
      acquisitionMs: transactionStartedAt ? Math.round(transactionStartedAt - callStartedAt) : null,
      guardMs: guardMs ?? null,
      selectOneMs: selectOneMs ?? null,
      transactionMs: transactionStartedAt ? Math.round(completedAt - transactionStartedAt) : null,
      transactionCallMs: Math.round(completedAt - callStartedAt),
      errorCode: error?.code || null,
      errorMessage: String(error?.message || error).replace(/postgresql?:\/\/\\S+/gi, "[URL MASQUÉE]")
    };
  }
}

try {
  const correct = await run("immos_recipe_phase8");
  if (correct.result !== "COMMIT") {
    console.log(JSON.stringify({ correct }, null, 2));
    process.exitCode = 2;
  } else {
    const mismatch = await run("invalid_expected_schema_for_test");
    const output = { correct, mismatch };
    console.log(JSON.stringify(output, null, 2));
    if (mismatch.result !== "ROLLBACK" ||
        !mismatch.errorMessage?.includes("invalid_expected_schema_for_test")) {
      throw new Error("Le test négatif de schéma n'a pas provoqué le rollback attendu.");
    }
  }
} finally {
  await prisma.$disconnect();
}
