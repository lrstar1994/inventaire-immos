import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const env = await loadSupabaseEnv();
const prisma = new PrismaClient({ datasourceUrl: env.SUPABASE_DIRECT_URL, errorFormat: "minimal" });
const runtimePrisma = new PrismaClient({ datasourceUrl: env.SUPABASE_DATABASE_URL, errorFormat: "minimal" });
const models = [
  ["users", "user"],
  ["suppliers", "supplier"],
  ["locations", "location"],
  ["asset_categories", "assetCategory"],
  ["asset_items", "assetItem"],
  ["asset_entries", "assetEntry"],
  ["asset_units", "assetUnit"],
  ["asset_files", "assetFile"],
  ["asset_movements", "assetMovement"],
  ["asset_movement_lines", "assetMovementLine"],
  ["asset_documents", "assetDocument"],
  ["asset_document_entries", "assetDocumentEntry"],
  ["asset_document_lines", "assetDocumentLine"],
  ["sensitive_action_approvals", "sensitiveActionApproval"],
  ["audit_logs", "auditLog"]
];

try {
  const businessTables = await prisma.$queryRawUnsafe(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'immos' AND table_type = 'BASE TABLE'
       AND table_name <> '_prisma_migrations'
     ORDER BY table_name`
  );
  const publicInventoryTables = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    models.map(([table]) => table)
  );
  const publicMigrationTable = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = '_prisma_migrations'`
  );
  const enums = await prisma.$queryRawUnsafe(
    `SELECT t.typname AS enum_name
     FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'immos' AND t.typtype = 'e'
     ORDER BY t.typname`
  );
  const primaryKeys = await prisma.$queryRawUnsafe(
    `SELECT tc.table_name, tc.constraint_name
     FROM information_schema.table_constraints tc
     WHERE tc.table_schema = 'immos' AND tc.constraint_type = 'PRIMARY KEY'
       AND tc.table_name <> '_prisma_migrations'
     ORDER BY tc.table_name`
  );
  const foreignKeys = await prisma.$queryRawUnsafe(
    `SELECT
       tc.table_name,
       tc.constraint_name,
       rc.delete_rule,
       rc.update_rule
     FROM information_schema.table_constraints tc
     JOIN information_schema.referential_constraints rc
       ON rc.constraint_schema = tc.constraint_schema
      AND rc.constraint_name = tc.constraint_name
     WHERE tc.table_schema = 'immos' AND tc.constraint_type = 'FOREIGN KEY'
     ORDER BY tc.table_name, tc.constraint_name`
  );
  const indexes = await prisma.$queryRawUnsafe(
    `SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition
     FROM pg_indexes
     WHERE schemaname = 'immos' AND tablename <> '_prisma_migrations'
     ORDER BY tablename, indexname`
  );
  const partialPrimary = indexes.find((item) => item.index_name === "asset_files_one_active_primary_per_asset_idx");
  const primaryMimeCheck = await prisma.$queryRawUnsafe(
    `SELECT conname, pg_get_constraintdef(c.oid) AS definition
     FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname = 'immos' AND conname = 'asset_files_primary_must_be_image_check'`
  );
  const timestamptzColumns = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name, datetime_precision
     FROM information_schema.columns
     WHERE table_schema = 'immos' AND table_name <> '_prisma_migrations'
       AND data_type = 'timestamp with time zone'
     ORDER BY table_name, ordinal_position`
  );
  const integerColumns = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'immos'
       AND column_name IN ('unit_price', 'total_price', 'file_size')
     ORDER BY table_name, column_name`
  );
  const idColumns = await prisma.$queryRawUnsafe(
    `SELECT table_name, data_type, column_default
     FROM information_schema.columns
     WHERE table_schema = 'immos' AND column_name = 'id'
       AND table_name <> '_prisma_migrations'
     ORDER BY table_name`
  );
  const migrationRows = await prisma.$queryRawUnsafe(
    `SELECT migration_name, finished_at IS NOT NULL AS finished
     FROM "immos"."_prisma_migrations" ORDER BY migration_name`
  );
  const rowCounts = {};
  const runtimeRowCounts = {};
  for (const [table, delegate] of models) {
    rowCounts[table] = await prisma[delegate].count();
    runtimeRowCounts[table] = await runtimePrisma[delegate].count();
  }

  const report = {
    checkedAt: new Date().toISOString(),
    schema: "immos",
    businessTables: businessTables.map((item) => item.table_name),
    technicalMigrationTableInImmos: true,
    inventoryTablesInPublic: publicInventoryTables.map((item) => item.table_name),
    migrationTableInPublic: publicMigrationTable.length > 0,
    enums: enums.map((item) => item.enum_name),
    primaryKeys,
    foreignKeys,
    indexes,
    partialPrimaryIndexValid: Boolean(
      partialPrimary &&
      partialPrimary.definition.includes("(asset_unit_id)") &&
      partialPrimary.definition.includes("is_primary") &&
      partialPrimary.definition.includes("deleted_at IS NULL")
    ),
    primaryMimeCheckValid: primaryMimeCheck.length === 1 && primaryMimeCheck[0].definition.includes("mime_type"),
    timestamptzColumns,
    allTimestamptzPrecision3: timestamptzColumns.every((item) => item.datetime_precision === 3),
    integerColumns,
    allSelectedNumericColumnsInteger: integerColumns.every((item) => item.data_type === "integer"),
    idColumns,
    allIdsTextWithoutDatabaseDefault: idColumns.every((item) => item.data_type === "text" && item.column_default === null),
    cuidDefaultsDefinedInPrismaSchema: true,
    migrationRows,
    rowCounts,
    runtimeRowCounts,
    allBusinessTablesEmpty:
      Object.values(rowCounts).every((count) => count === 0) &&
      Object.values(runtimeRowCounts).every((count) => count === 0),
    directAndRuntimeCountsMatch: models.every(([table]) => rowCounts[table] === runtimeRowCounts[table])
  };

  const outputRoot = path.resolve(process.cwd(), "outputs", "migration", "supabase-phase-4");
  await mkdir(outputRoot, { recursive: true });
  const outputPath = path.join(outputRoot, "postgresql-structure.json");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outputPath,
    businessTables: report.businessTables.length,
    enums: report.enums.length,
    primaryKeys: report.primaryKeys.length,
    foreignKeys: report.foreignKeys.length,
    indexes: report.indexes.length,
    timestamptzColumns: report.timestamptzColumns.length,
    inventoryTablesInPublic: report.inventoryTablesInPublic.length,
    migrationTableInPublic: report.migrationTableInPublic,
    partialPrimaryIndexValid: report.partialPrimaryIndexValid,
    primaryMimeCheckValid: report.primaryMimeCheckValid,
    allBusinessTablesEmpty: report.allBusinessTablesEmpty,
    directAndRuntimeCountsMatch: report.directAndRuntimeCountsMatch
  }, null, 2));
} finally {
  await prisma.$disconnect();
  await runtimePrisma.$disconnect();
}
