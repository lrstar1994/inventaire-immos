import { createHash } from "node:crypto";
import { PrismaClient as NormalPrismaClient } from "../generated/prisma-postgresql/index.js";
import { PrismaClient as RecipePrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const env = await loadSupabaseEnv();
const direct = new URL(env.SUPABASE_DIRECT_URL);
const normalUrl = new URL(direct);
normalUrl.searchParams.set("schema", "immos");
const recipeUrl = new URL(direct);
recipeUrl.searchParams.set("schema", "immos_recipe_phase8");
const maskedUser = direct.username.length > 5
  ? `${direct.username.slice(0, 3)}***${direct.username.slice(-2)}`
  : "***";
const connection = {
  protocol: direct.protocol.replace(":", ""),
  host: direct.hostname,
  port: Number(direct.port),
  database: direct.pathname.replace(/^\//, ""),
  username: maskedUser,
  sslmode: direct.searchParams.get("sslmode"),
  connectTimeout: direct.searchParams.get("connect_timeout") || "driver-default",
  mode: Number(direct.port) === 5432 && direct.hostname.includes("pooler.supabase.com")
    ? "Supabase pooler session"
    : "other"
};
if (process.argv.includes("--config-only")) {
  console.log(JSON.stringify({ connection }, null, 2));
  process.exit(0);
}

async function inspect(Client, url, expectedSchema) {
  const prisma = new Client({ datasourceUrl: url.toString(), errorFormat: "minimal" });
  const started = performance.now();
  try {
    const [one] = await prisma.$queryRaw`SELECT 1::int AS value`;
    const [schema] = await prisma.$queryRaw`SELECT current_schema() AS schema`;
    const [counts] = await prisma.$queryRaw`
      SELECT
        (SELECT COUNT(*)::int FROM "immos"."users") +
        (SELECT COUNT(*)::int FROM "immos"."suppliers") +
        (SELECT COUNT(*)::int FROM "immos"."locations") +
        (SELECT COUNT(*)::int FROM "immos"."asset_categories") +
        (SELECT COUNT(*)::int FROM "immos"."asset_items") +
        (SELECT COUNT(*)::int FROM "immos"."asset_entries") +
        (SELECT COUNT(*)::int FROM "immos"."asset_units") +
        (SELECT COUNT(*)::int FROM "immos"."asset_files") +
        (SELECT COUNT(*)::int FROM "immos"."asset_movements") +
        (SELECT COUNT(*)::int FROM "immos"."asset_movement_lines") +
        (SELECT COUNT(*)::int FROM "immos"."asset_documents") +
        (SELECT COUNT(*)::int FROM "immos"."asset_document_entries") +
        (SELECT COUNT(*)::int FROM "immos"."asset_document_lines") +
        (SELECT COUNT(*)::int FROM "immos"."sensitive_action_approvals") +
        (SELECT COUNT(*)::int FROM "immos"."audit_logs") AS immos_total,
        (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."users") +
        (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."suppliers") +
        (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."locations") +
        (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_categories") +
        (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_items") +
        (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_entries") +
        (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_units") +
        (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_files") +
        (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_movements") +
        (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_movement_lines") +
        (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_documents") +
        (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_document_entries") +
        (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_document_lines") +
        (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."sensitive_action_approvals") +
        (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."audit_logs") AS recipe_total`;
    const fingerprintRows = await prisma.$queryRaw`
      SELECT id, action, entity_table, entity_id, created_at
      FROM "immos"."audit_logs" ORDER BY id`;
    return {
      expectedSchema,
      selectOne: one.value === 1,
      currentSchema: schema.schema,
      immosTotal: counts.immos_total,
      recipeTotal: counts.recipe_total,
      minimalImmosFingerprint: createHash("sha256").update(JSON.stringify(fingerprintRows)).digest("hex"),
      durationMs: Math.round(performance.now() - started)
    };
  } finally {
    await prisma.$disconnect();
  }
}

const normal = await inspect(NormalPrismaClient, normalUrl, "immos");
const recipe = await inspect(RecipePrismaClient, recipeUrl, "immos_recipe_phase8");
console.log(JSON.stringify({ connection, normal, recipe }, null, 2));
if (normal.currentSchema !== "immos" || recipe.currentSchema !== "immos_recipe_phase8" ||
    normal.immosTotal !== 222 || normal.recipeTotal !== 247 ||
    recipe.immosTotal !== 222 || recipe.recipeTotal !== 247) {
  throw new Error("Diagnostic PostgreSQL non conforme.");
}
