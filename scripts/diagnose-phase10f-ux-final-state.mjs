import { PrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const RECIPE_SCHEMA = "immos_recipe_phase8";

const env = await loadSupabaseEnv();
const target = new URL(env.SUPABASE_DATABASE_URL);
target.searchParams.set("schema", RECIPE_SCHEMA);
target.searchParams.set("pgbouncer", "true");
target.searchParams.set("connection_limit", "1");

const prisma = new PrismaClient({
  datasourceUrl: target.toString(),
  errorFormat: "minimal"
});

try {
  const [schema] = await prisma.$queryRawUnsafe("SELECT current_schema() AS schema");
  if (schema?.schema !== RECIPE_SCHEMA) {
    throw new Error("Cible Recipe inattendue.");
  }
  const temporaryMembershipsRemaining = await prisma.user.count({
    where: { externalAuthId: env.AUTH_RECIPE_TEST_USER_ID }
  });
  console.log(JSON.stringify({
    result: "PHASE10F_UX_FINAL_STATE",
    schema: schema.schema,
    temporaryMembershipsRemaining
  }));
} finally {
  await prisma.$disconnect();
}
