import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const RECIPE_SCHEMA = "immos_recipe_phase8";
const env = await loadSupabaseEnv();
const adminUrl = new URL(env.SUPABASE_DIRECT_URL);
if (adminUrl.searchParams.get("schema") !== "immos") throw new Error("La connexion administrative doit partir de immos.");
const prisma = new PrismaClient({ datasourceUrl: adminUrl.toString(), errorFormat: "minimal" });

async function runPrisma(args, recipeUrl) {
  const cli = path.resolve(process.cwd(), "node_modules/prisma/build/index.js");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, SUPABASE_DIRECT_URL: recipeUrl.toString() },
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Prisma a échoué (${code}).`)));
  });
}

async function runBaselineWithPsql(migrationPath, recipeUrl) {
  const psql = "C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe";
  await new Promise((resolve, reject) => {
    const child = spawn(psql, ["--no-password", "--set", "ON_ERROR_STOP=1", "--file", migrationPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PGHOST: recipeUrl.hostname,
        PGPORT: recipeUrl.port,
        PGDATABASE: recipeUrl.pathname.replace(/^\//, ""),
        PGUSER: decodeURIComponent(recipeUrl.username),
        PGPASSWORD: decodeURIComponent(recipeUrl.password),
        PGSSLMODE: "require"
      },
      stdio: ["ignore", "inherit", "inherit"]
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Baseline psql échouée (${code}).`)));
  });
}

try {
  const [existing] = await prisma.$queryRawUnsafe(
    `SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) AS exists`, RECIPE_SCHEMA
  );
  if (existing.exists) {
    const [state] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema=$1`, RECIPE_SCHEMA
    );
    if (state.count !== 0) throw new Error(`Création refusée : ${RECIPE_SCHEMA} n'est pas vide.`);
  } else {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${RECIPE_SCHEMA}"`);
  }

  const workRoot = path.resolve(process.cwd(), "outputs/migration/supabase-phase-8/prisma");
  const migrationsRoot = path.join(workRoot, "migrations", "00000000000000_baseline");
  await mkdir(migrationsRoot, { recursive: true });
  const baseSchema = await readFile(path.resolve("prisma/postgresql/schema.prisma"), "utf8");
  const recipeSchema = baseSchema
    .replace('output   = "../../generated/prisma-postgresql"', 'output   = "../../../../generated/prisma-postgresql"')
    .replaceAll('"immos"', `"${RECIPE_SCHEMA}"`);
  const baseMigration = await readFile(
    path.resolve("prisma/postgresql/migrations/00000000000000_baseline/migration.sql"), "utf8"
  );
  const recipeMigration = baseMigration.replaceAll('"immos"', `"${RECIPE_SCHEMA}"`);
  await writeFile(path.join(workRoot, "schema.prisma"), recipeSchema, "utf8");
  await writeFile(path.join(migrationsRoot, "migration.sql"), recipeMigration, "utf8");
  await writeFile(path.join(workRoot, "migrations", "migration_lock.toml"), 'provider = "postgresql"\n', "utf8");

  const recipeUrl = new URL(env.SUPABASE_DIRECT_URL);
  recipeUrl.searchParams.set("schema", RECIPE_SCHEMA);
  await runBaselineWithPsql(path.join(migrationsRoot, "migration.sql"), recipeUrl);
  await prisma.$executeRawUnsafe(
    `CREATE TABLE "${RECIPE_SCHEMA}"."_prisma_migrations"
     (LIKE "immos"."_prisma_migrations" INCLUDING ALL)`
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${RECIPE_SCHEMA}"."_prisma_migrations"
     SELECT * FROM "immos"."_prisma_migrations"`
  );
  await prisma.$disconnect();
  await runPrisma(["generate", "--schema", path.join(workRoot, "schema.prisma")], recipeUrl);
  console.log(JSON.stringify({ result: "RECIPE_SCHEMA_READY", schema: RECIPE_SCHEMA }, null, 2));
} catch (error) {
  throw error;
} finally {
  await prisma.$disconnect();
}
