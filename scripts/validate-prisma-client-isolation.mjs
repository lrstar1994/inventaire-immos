import { PrismaClient as NormalPrismaClient } from "../generated/prisma-postgresql/index.js";
import { PrismaClient as RecipePrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const env = await loadSupabaseEnv();
const normalUrl = new URL(env.SUPABASE_DIRECT_URL);
normalUrl.searchParams.set("schema", "immos");
const recipeUrl = new URL(env.SUPABASE_DIRECT_URL);
recipeUrl.searchParams.set("schema", "immos_recipe_phase8");

const normal = new NormalPrismaClient({ datasourceUrl: normalUrl.toString(), errorFormat: "minimal" });
const recipe = new RecipePrismaClient({ datasourceUrl: recipeUrl.toString(), errorFormat: "minimal" });

try {
  const [normalSchema] = await normal.$queryRaw`SELECT current_schema() AS schema`;
  const [recipeSchema] = await recipe.$queryRaw`SELECT current_schema() AS schema`;
  const [normalCount, recipeCount] = await Promise.all([
    normal.supplier.count(),
    recipe.supplier.count()
  ]);
  const result = {
    normal: { client: "generated/prisma-postgresql", expectedSchema: "immos", currentSchema: normalSchema.schema, supplierCount: normalCount },
    recipe: { client: "generated/prisma-recipe", expectedSchema: "immos_recipe_phase8", currentSchema: recipeSchema.schema, supplierCount: recipeCount },
    independent: normalSchema.schema === "immos" && recipeSchema.schema === "immos_recipe_phase8"
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.independent) throw new Error("Les clients Prisma ne sont pas isolés.");
} finally {
  await Promise.allSettled([normal.$disconnect(), recipe.$disconnect()]);
}
