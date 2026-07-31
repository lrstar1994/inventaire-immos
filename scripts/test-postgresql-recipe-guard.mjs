import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadSupabaseEnv } from "./supabase-env.mjs";
import {
  assertPostgreSQLRecipeProtectedBaseline,
  POSTGRESQL_RECIPE_PROTECTED_BASELINE
} from "./postgresql-recipe-protected-baseline.mjs";

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

assertPostgreSQLRecipeProtectedBaseline({
  ...POSTGRESQL_RECIPE_PROTECTED_BASELINE
});

for (const divergence of [
  { recipeTotal: 222 },
  { recipeTotal: 254 },
  { productionTotal: 221 },
  { recipeAssetUnits: 12 },
  { recipeAssetFiles: 1 },
  { productionAssetUnits: 13 },
  { productionAssetFiles: 1 },
  { recipeForeignKeyOrphans: 1 }
]) {
  let refused = false;
  try {
    assertPostgreSQLRecipeProtectedBaseline({
      ...POSTGRESQL_RECIPE_PROTECTED_BASELINE,
      ...divergence
    });
  } catch {
    refused = true;
  }
  if (!refused) {
    throw new Error(`La divergence ${Object.keys(divergence)[0]} n'a pas été refusée.`);
  }
}

console.log(JSON.stringify({
  result: "RECIPE_PROTECTED_BASELINE_GUARDS_OK",
  accepted: "253/222",
  obsoleteBaselineRefused: "222/222",
  divergencesRefused: true
}, null, 2));

const skipped = spawnSync(process.execPath, [path.resolve("scripts", "preflight-postgresql-recipe.mjs")], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    APP_DATABASE_PROVIDER: "postgresql",
    APP_PRISMA_CLIENT: "recipe",
    SUPABASE_DATABASE_URL: recipeUrl.toString(),
    RECIPE_SKIP_PREFLIGHT: "1",
    RECIPE_PREFLIGHT_DEVELOPMENT: "1"
  },
  encoding: "utf8"
});
if (skipped.status !== 0) {
  throw new Error("Le contournement reseau explicite de developpement a echoue.");
}
const skipOutput = `${skipped.stderr}\n${skipped.stdout}`;
if (!skipOutput.includes("VOLONTAIREMENT IGNORE")) {
  throw new Error("L'avertissement visible du contournement est absent.");
}
if (!skipOutput.includes("LA RECETTE DISTANTE N'EST PAS VALIDEE")) {
  throw new Error("Le contournement ne signale pas explicitement que la recette distante reste non validee.");
}

const productionSkip = spawnSync(process.execPath, [path.resolve("scripts", "preflight-postgresql-recipe.mjs")], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    APP_DATABASE_PROVIDER: "postgresql",
    APP_PRISMA_CLIENT: "recipe",
    SUPABASE_DATABASE_URL: recipeUrl.toString(),
    RECIPE_SKIP_PREFLIGHT: "1",
    RECIPE_PREFLIGHT_DEVELOPMENT: "0"
  },
  encoding: "utf8"
});
if (productionSkip.status === 0 || !`${productionSkip.stderr}\n${productionSkip.stdout}`.includes("uniquement")) {
  throw new Error("Le contournement reseau n'a pas ete refuse hors developpement.");
}

console.log(JSON.stringify({
  result: "RECIPE_NETWORK_PREFLIGHT_SKIP_GUARDS_OK",
  developmentSkipWarned: true,
  nonDevelopmentSkipRefused: true
}, null, 2));

const unreachableUrl = new URL("postgresql://recipe_test:fake@127.0.0.1:5432/recipe_test");
unreachableUrl.searchParams.set("schema", "immos_recipe_phase8");
unreachableUrl.searchParams.set("sslmode", "require");
unreachableUrl.searchParams.set("connect_timeout", "1");
const unreachable = spawnSync(process.execPath, [path.resolve("scripts", "preflight-postgresql-recipe.mjs")], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    APP_DATABASE_PROVIDER: "postgresql",
    APP_PRISMA_CLIENT: "recipe",
    SUPABASE_DATABASE_URL: unreachableUrl.toString(),
    RECIPE_SKIP_PREFLIGHT: "0",
    RECIPE_PREFLIGHT_DEVELOPMENT: "1"
  },
  encoding: "utf8"
});
const unreachableOutput = `${unreachable.stderr}\n${unreachable.stdout}`;
for (const expected of [
  "impossible de joindre PostgreSQL Supabase",
  "probleme reseau ou connectivite",
  "SQLite locale n'est pas concernee",
  "Aucune donnee n'a ete modifiee"
]) {
  if (!unreachableOutput.includes(expected)) {
    throw new Error(`Le diagnostic reseau attendu est incomplet : ${expected}`);
  }
}

console.log(JSON.stringify({
  result: "RECIPE_NETWORK_FAILURE_MESSAGE_OK",
  defaultFailurePreserved: unreachable.status !== 0,
  sqliteExplicitlyUnaffected: true,
  noDataMutationClaimed: true
}, null, 2));
