import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const env = await loadSupabaseEnv();
const recipeUrl = new URL(env.SUPABASE_DIRECT_URL);
recipeUrl.searchParams.set("schema", "immos_recipe_phase8");
const result = spawnSync(process.execPath, [path.resolve("scripts", "preflight-postgresql-recipe.mjs")], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    APP_DATABASE_PROVIDER: "postgresql",
    APP_PRISMA_CLIENT: "normal",
    SUPABASE_DATABASE_URL: recipeUrl.toString()
  },
  encoding: "utf8"
});

if (result.status === 0) {
  throw new Error("Échec du test : la combinaison incohérente n'a pas été refusée.");
}
const refusedBeforeConnection = `${result.stderr}\n${result.stdout}`.includes(
  "APP_PRISMA_CLIENT doit valoir recipe"
);
if (!refusedBeforeConnection) {
  throw new Error("Le garde-fou a échoué pour une raison inattendue.");
}
console.log(JSON.stringify({
  result: "GUARD_REFUSED_INCONSISTENT_CONFIGURATION",
  provider: "postgresql",
  requestedClient: "normal",
  requestedSchema: "immos_recipe_phase8",
  refusedBeforeConnection
}, null, 2));
