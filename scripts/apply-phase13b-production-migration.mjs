import { createHash } from "node:crypto";
import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const CONFIRMATION = "APPLY_PHASE13B_REFERENCE_FOUNDATION_TO_IMMOS";
const SCHEMA = "immos";
const ENUMS = Object.freeze({
  AssetCategoryLevel: ["CATEGORY", "SUBCATEGORY", "FAMILY"],
  AssetTrackingMode: ["I", "Q", "QI", "E"],
  AssetControlLevel: ["C1", "C2", "C3", "C4"]
});
const COLUMNS = Object.freeze([
  ["hierarchy_level", "USER-DEFINED", "AssetCategoryLevel", "NO", "'CATEGORY'::\"immos\".\"AssetCategoryLevel\""],
  ["tracking_mode", "USER-DEFINED", "AssetTrackingMode", "YES", null],
  ["control_level", "USER-DEFINED", "AssetControlLevel", "YES", null]
]);
const TABLES = Object.freeze([
  "users", "suppliers", "locations", "asset_categories", "asset_items", "asset_entries",
  "asset_units", "asset_files", "asset_movements", "asset_movement_lines", "asset_documents",
  "asset_document_entries", "asset_document_lines", "sensitive_action_approvals", "audit_logs"
]);

function fail(message) {
  throw new Error(`PHASE13B_PRODUCTION_REFUSED:${message}`);
}

function mode() {
  if (process.argv.includes("--inspect")) return "INSPECT";
  if (process.argv.includes(`--confirm=${CONFIRMATION}`)) return "EXECUTE";
  fail(`mode requis: --inspect ou --confirm=${CONFIRMATION}`);
}

function buildMigrationUrl(rawUrl) {
  const target = new URL(rawUrl);
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) fail("URL PostgreSQL obligatoire");
  if (target.port !== "5432") fail("canal de migration Session pooler 5432 obligatoire");
  if (target.pathname !== "/postgres") fail("base postgres obligatoire");
  if (target.searchParams.get("schema") !== SCHEMA) fail("schema=immos obligatoire");
  if (target.searchParams.get("sslmode") !== "require") fail("sslmode=require obligatoire");
  return target;
}

function checksum(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function readEnums(tx) {
  const rows = await tx.$queryRawUnsafe(`
    SELECT t.typname AS type_name, e.enumlabel AS value
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = '${SCHEMA}'
      AND t.typname IN ('AssetCategoryLevel', 'AssetTrackingMode', 'AssetControlLevel')
    ORDER BY t.typname, e.enumsortorder
  `);
  return Object.fromEntries(Object.keys(ENUMS).map((type) => [
    type,
    rows.filter((row) => row.type_name === type).map((row) => row.value)
  ]));
}

async function readColumns(tx) {
  return tx.$queryRawUnsafe(`
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = '${SCHEMA}' AND table_name = 'asset_categories'
      AND column_name IN ('hierarchy_level', 'tracking_mode', 'control_level')
    ORDER BY ordinal_position
  `);
}

async function readOrphans(tx) {
  const [row] = await tx.$queryRawUnsafe(`
    SELECT (
      (SELECT COUNT(*) FROM "immos"."asset_files" f LEFT JOIN "immos"."asset_units" u ON u.id=f.asset_unit_id WHERE u.id IS NULL)
      + (SELECT COUNT(*) FROM "immos"."asset_movement_lines" l LEFT JOIN "immos"."asset_movements" m ON m.id=l.movement_id LEFT JOIN "immos"."asset_units" u ON u.id=l.asset_unit_id WHERE m.id IS NULL OR u.id IS NULL)
      + (SELECT COUNT(*) FROM "immos"."asset_document_entries" e LEFT JOIN "immos"."asset_documents" d ON d.id=e.document_id LEFT JOIN "immos"."asset_entries" a ON a.id=e.asset_entry_id WHERE d.id IS NULL OR a.id IS NULL)
      + (SELECT COUNT(*) FROM "immos"."asset_document_lines" l LEFT JOIN "immos"."asset_documents" d ON d.id=l.document_id LEFT JOIN "immos"."asset_units" u ON u.id=l.asset_unit_id WHERE d.id IS NULL OR (l.asset_unit_id IS NOT NULL AND u.id IS NULL))
    )::int AS count
  `);
  return row.count;
}

async function inspect(tx) {
  const [identity] = await tx.$queryRawUnsafe("SELECT current_schema() AS schema, current_database() AS database_name");
  if (identity?.schema !== SCHEMA) fail("current_schema() doit être immos");

  const [counts] = await tx.$queryRawUnsafe(`
    SELECT
      (${TABLES.map((table) => `(SELECT COUNT(*) FROM "immos"."${table}")`).join(" + ")})::int AS total,
      (SELECT COUNT(*)::int FROM "immos"."asset_categories") AS asset_categories,
      (SELECT COUNT(*)::int FROM "immos"."asset_items") AS asset_items,
      (SELECT COUNT(*)::int FROM "immos"."asset_entries") AS asset_entries,
      (SELECT COUNT(*)::int FROM "immos"."asset_units") AS asset_units,
      (SELECT COUNT(*)::int FROM "immos"."asset_movements") AS asset_movements,
      (SELECT COUNT(*)::int FROM "immos"."asset_documents") AS asset_documents,
      (SELECT COUNT(*)::int FROM "immos"."asset_files") AS asset_files,
      (SELECT COUNT(*)::int FROM "immos"."users") AS users
  `);
  if (counts.asset_units !== 12 || counts.asset_files !== 0) fail("totaux Production protégés inattendus");
  const categories = await tx.$queryRawUnsafe(`
    SELECT id::text, code, name, parent_id::text, status::text
    FROM "immos"."asset_categories"
    ORDER BY id
  `);
  const indexRows = await tx.$queryRawUnsafe(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname='immos' AND tablename='asset_categories'
    ORDER BY indexname
  `);
  return {
    schema: identity.schema,
    total: counts.total,
    counts,
    categories,
    categorySnapshot: checksum(categories),
    foreignKeyOrphans: await readOrphans(tx),
    enums: await readEnums(tx),
    columns: await readColumns(tx),
    indexes: indexRows
  };
}

function assertPreconditions(state) {
  if (state.foreignKeyOrphans !== 0) fail("FK orphelines Production détectées");
  const enumCount = Object.values(state.enums).filter((values) => values.length > 0).length;
  if (enumCount !== 0) fail("types 13B déjà présents ou état partiel détecté");
  if (state.columns.length !== 0) fail("colonnes 13B déjà présentes ou état partiel détecté");
  if (state.categories.some((category) => !category.code || !category.name)) fail("catégorie historique incomplète");
}

function assertAfter(before, after) {
  for (const [type, values] of Object.entries(ENUMS)) {
    if (JSON.stringify(after.enums[type]) !== JSON.stringify(values)) fail(`enum ${type} non conforme`);
  }
  const normalizedColumns = after.columns.map((column) => [
    column.column_name, column.data_type, column.udt_name, column.is_nullable, column.column_default
  ]);
  if (JSON.stringify(normalizedColumns) !== JSON.stringify(COLUMNS)) fail("colonnes asset_categories non conformes");
  if (before.total !== after.total || JSON.stringify(before.counts) !== JSON.stringify(after.counts)) {
    fail("compteurs métier modifiés par la migration");
  }
  if (before.categorySnapshot !== after.categorySnapshot) {
    const beforeById = new Map(before.categories.map((entry) => [entry.id, entry]));
    for (const afterCategory of after.categories) {
      const prior = beforeById.get(afterCategory.id);
      if (!prior || prior.code !== afterCategory.code || prior.name !== afterCategory.name || prior.parent_id !== afterCategory.parent_id || prior.status !== afterCategory.status) {
        fail("donnée historique de catégorie modifiée hors métadonnées 13B");
      }
    }
  }
  if (after.foreignKeyOrphans !== 0) fail("FK orphelines après migration");
  if (!after.indexes.some((index) => index.indexname === "asset_categories_hierarchy_level_idx")) {
    fail("index hierarchy_level absent");
  }
}

async function main() {
  const env = await loadSupabaseEnv();
  const target = buildMigrationUrl(env.SUPABASE_DIRECT_URL);
  const selectedMode = mode();

  const prisma = new PrismaClient({ datasourceUrl: target.toString(), errorFormat: "minimal" });
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (selectedMode === "INSPECT") {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        const state = await inspect(tx);
        assertPreconditions(state);
        return { before: state, after: state, statements: 0 };
      }
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('phase13b:immos:reference-foundation'))");
      const before = await inspect(tx);
      assertPreconditions(before);

      const executed = [
        `CREATE TYPE "immos"."AssetCategoryLevel" AS ENUM ('CATEGORY', 'SUBCATEGORY', 'FAMILY')`,
        `CREATE TYPE "immos"."AssetTrackingMode" AS ENUM ('I', 'Q', 'QI', 'E')`,
        `CREATE TYPE "immos"."AssetControlLevel" AS ENUM ('C1', 'C2', 'C3', 'C4')`,
        `ALTER TABLE "immos"."asset_categories" ADD COLUMN "hierarchy_level" "immos"."AssetCategoryLevel" NOT NULL DEFAULT 'CATEGORY', ADD COLUMN "tracking_mode" "immos"."AssetTrackingMode", ADD COLUMN "control_level" "immos"."AssetControlLevel"`,
        `UPDATE "immos"."asset_categories" SET "hierarchy_level" = 'SUBCATEGORY' WHERE "parent_id" IN (SELECT "id" FROM "immos"."asset_categories" WHERE "parent_id" IS NULL)`,
        `UPDATE "immos"."asset_categories" SET "hierarchy_level" = 'FAMILY', "tracking_mode" = 'I', "control_level" = 'C1' WHERE "parent_id" IN (SELECT "id" FROM "immos"."asset_categories" WHERE "hierarchy_level" = 'SUBCATEGORY')`,
        `DO $$ BEGIN IF EXISTS (SELECT 1 FROM "immos"."asset_categories" child LEFT JOIN "immos"."asset_categories" parent ON parent."id" = child."parent_id" WHERE (child."hierarchy_level" = 'CATEGORY' AND child."parent_id" IS NOT NULL) OR (child."hierarchy_level" = 'SUBCATEGORY' AND parent."hierarchy_level" IS DISTINCT FROM 'CATEGORY') OR (child."hierarchy_level" = 'FAMILY' AND parent."hierarchy_level" IS DISTINCT FROM 'SUBCATEGORY')) THEN RAISE EXCEPTION 'Hiérarchie historique incompatible avec CATEGORY/SUBCATEGORY/FAMILY'; END IF; END $$`,
        `CREATE INDEX "asset_categories_hierarchy_level_idx" ON "immos"."asset_categories"("hierarchy_level")`
      ];
      for (const statement of executed) await tx.$executeRawUnsafe(statement);
      const after = await inspect(tx);
      assertAfter(before, after);
      return { before, after, statements: executed.length };
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 120_000 });

    console.log(JSON.stringify({
      result: selectedMode === "INSPECT" ? "PHASE13B_PRODUCTION_MIGRATION_PREFLIGHT_OK" : "PHASE13B_PRODUCTION_MIGRATION_APPLIED",
      mode: selectedMode,
      channel: "SUPABASE_DIRECT_URL",
      port: 5432,
      schema: result.after.schema,
      total: result.after.total,
      assetCategories: result.after.counts.asset_categories,
      assetItems: result.after.counts.asset_items,
      assetEntries: result.after.counts.asset_entries,
      assetUnits: result.after.counts.asset_units,
      assetFiles: result.after.counts.asset_files,
      foreignKeyOrphans: result.after.foreignKeyOrphans,
      statements: result.statements,
      categoryMetadataOnly: true
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration 13B Production échouée.");
  process.exitCode = 1;
});
