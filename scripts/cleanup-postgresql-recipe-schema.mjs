import { spawn } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const RECIPE_SCHEMA = "immos_recipe_phase8";
if (RECIPE_SCHEMA === "immos" || RECIPE_SCHEMA === "public") throw new Error("Schéma de nettoyage interdit.");
const env = await loadSupabaseEnv();
const adminUrl = new URL(env.SUPABASE_DIRECT_URL);
if (adminUrl.searchParams.get("schema") !== "immos") throw new Error("Connexion administrative inattendue.");
const prisma = new PrismaClient({ datasourceUrl: adminUrl.toString(), errorFormat: "minimal" });

try {
  const [state] = await prisma.$queryRawUnsafe(
    `SELECT current_schema() AS current_schema,
            EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) AS recipe_exists`, RECIPE_SCHEMA
  );
  if (state.current_schema !== "immos" || !state.recipe_exists) {
    throw new Error("Nettoyage refusé : cible ambiguë ou schéma de recette absent.");
  }
  await prisma.$executeRawUnsafe(`DROP SCHEMA "${RECIPE_SCHEMA}" CASCADE`);
  const [after] = await prisma.$queryRawUnsafe(
    `SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) AS recipe_exists`, RECIPE_SCHEMA
  );
  if (after.recipe_exists) throw new Error("Le schéma de recette existe encore.");
  console.log(JSON.stringify({ result: "RECIPE_SCHEMA_REMOVED", schema: RECIPE_SCHEMA }, null, 2));
} finally {
  await prisma.$disconnect();
}

const cli = path.resolve(process.cwd(), "node_modules/prisma/build/index.js");
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [cli, "generate", "--schema", "prisma/postgresql/schema.prisma"], {
    cwd: process.cwd(),
    env: { ...process.env, SUPABASE_DIRECT_URL: env.SUPABASE_DIRECT_URL },
    stdio: "inherit"
  });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Régénération du client immos échouée (${code}).`)));
});
