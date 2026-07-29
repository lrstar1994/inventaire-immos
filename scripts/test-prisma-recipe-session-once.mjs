import { Prisma, PrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

if (process.env.APP_PRISMA_CLIENT !== "recipe") {
  throw new Error("APP_PRISMA_CLIENT=recipe obligatoire.");
}
const modelSchemas = [...new Set(Prisma.dmmf.datamodel.models.map((model) => model.schema))];
if (modelSchemas.length !== 1 || modelSchemas[0] !== "immos_recipe_phase8") {
  throw new Error("Le client chargé n'est pas generated/prisma-recipe.");
}
const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
url.searchParams.set("schema", "immos_recipe_phase8");
const creationStarted = performance.now();
const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });
const clientCreationMs = Math.round(performance.now() - creationStarted);
const beforeSelectMs = Math.round(performance.now() - creationStarted);
const selectStarted = performance.now();
try {
  const [one] = await prisma.$queryRaw`SELECT 1::int AS value`;
  const selectOneMs = Math.round(performance.now() - selectStarted);
  const schemaStarted = performance.now();
  const [schema] = await prisma.$queryRaw`SELECT current_schema() AS schema`;
  console.log(JSON.stringify({
    attemptCount: 1,
    client: "generated/prisma-recipe",
    clientCreationMs,
    beforeSelectMs,
    selectOneMs,
    selectOne: one.value,
    currentSchemaMs: Math.round(performance.now() - schemaStarted),
    currentSchema: schema.schema
  }, null, 2));
  if (one.value !== 1 || schema.schema !== "immos_recipe_phase8") process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
