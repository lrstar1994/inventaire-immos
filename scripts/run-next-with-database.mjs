import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const [provider, command, ...forwardedArgs] = process.argv.slice(2);
if (!["sqlite", "postgresql", "postgresql-recipe"].includes(provider)) {
  throw new Error("Backend invalide. Valeurs autorisées : sqlite, postgresql, postgresql-recipe.");
}
if (!["dev", "build", "start"].includes(command)) {
  throw new Error("Commande Next.js invalide. Valeurs autorisées : dev, build, start.");
}

const nextBinary = path.resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const args = command === "dev"
  ? ["dev", "--webpack", "-H", "0.0.0.0", ...forwardedArgs]
  : [command, ...forwardedArgs];
const childEnv = { ...process.env, APP_DATABASE_PROVIDER: provider === "sqlite" ? "sqlite" : "postgresql" };
childEnv.APP_PRISMA_CLIENT = provider === "sqlite" ? "sqlite" : "normal";
if (provider === "postgresql") {
  const env = await loadSupabaseEnv();
  childEnv.SUPABASE_DATABASE_URL = env.SUPABASE_DATABASE_URL;
  if (command === "build") {
    const prismaBinary = path.resolve(process.cwd(), "node_modules", "prisma", "build", "index.js");
    const generate = spawnSync(process.execPath, [
      prismaBinary,
      "generate",
      "--schema",
      path.resolve(process.cwd(), "prisma", "postgresql", "schema.prisma")
    ], {
      cwd: process.cwd(),
      env: childEnv,
      stdio: "inherit"
    });
    if (generate.status !== 0) {
      throw new Error("Build Production refusé : génération du client Prisma PostgreSQL échouée.");
    }
  }
  const preflight = spawnSync(process.execPath, [path.resolve(process.cwd(), "scripts", "preflight-postgresql-production.mjs")], {
    cwd: process.cwd(),
    env: childEnv,
    stdio: "inherit"
  });
  if (preflight.status !== 0) {
    throw new Error("Démarrage Production refusé par le prévol de sécurité.");
  }
}
if (provider === "postgresql-recipe") {
  const env = await loadSupabaseEnv();
  const recipeUrl = new URL(env.SUPABASE_DIRECT_URL);
  if (recipeUrl.port !== "5432") {
    throw new Error("La recette PostgreSQL exige la connexion session Supabase sur le port 5432.");
  }
  if (recipeUrl.searchParams.get("sslmode") !== "require") {
    throw new Error("La recette PostgreSQL exige sslmode=require.");
  }
  recipeUrl.searchParams.set("schema", "immos_recipe_phase8");
  childEnv.SUPABASE_DATABASE_URL = recipeUrl.toString();
  childEnv.APP_DATABASE_RECIPE_PHASE8 = "true";
  childEnv.APP_PRISMA_CLIENT = "recipe";
  childEnv.RECIPE_PREFLIGHT_DEVELOPMENT = command === "dev" ? "1" : "0";
  const preflight = spawnSync(process.execPath, [path.resolve(process.cwd(), "scripts", "preflight-postgresql-recipe.mjs")], {
    cwd: process.cwd(),
    env: childEnv,
    stdio: "inherit"
  });
  if (preflight.status !== 0) {
    throw new Error("Démarrage recette refusé par le prévol de sécurité.");
  }
}
const child = spawn(process.execPath, [nextBinary, ...args], {
  stdio: "inherit",
  env: childEnv
});

child.on("error", (error) => {
  console.error(`Impossible de démarrer Next.js : ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
