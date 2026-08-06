import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const PRODUCTION_SCHEMA = "immos";
const RECIPE_SCHEMA = "immos_recipe_phase8";
const EXPECTED_TOTALS = Object.freeze({
  [PRODUCTION_SCHEMA]: Object.freeze({ total: 222, assetUnits: 12, assetFiles: 0 }),
  [RECIPE_SCHEMA]: Object.freeze({ total: 253, assetUnits: 13, assetFiles: 0 })
});
const STORAGE_COLUMNS = Object.freeze([
  Object.freeze({
    name: "storage_provider",
    dataType: "USER-DEFINED",
    udtName: "StorageProvider",
    nullable: "YES",
    defaultValue: null
  }),
  Object.freeze({
    name: "storage_bucket",
    dataType: "text",
    udtName: "text",
    nullable: "YES",
    defaultValue: null
  }),
  Object.freeze({
    name: "storage_key",
    dataType: "text",
    udtName: "text",
    nullable: "YES",
    defaultValue: null
  }),
  Object.freeze({
    name: "updated_at",
    dataType: "timestamp with time zone",
    udtName: "timestamptz",
    nullable: "NO",
    defaultValue: null,
    datetimePrecision: 3
  })
]);
const TABLES = Object.freeze([
  "users", "suppliers", "locations", "asset_categories", "asset_items",
  "asset_entries", "asset_units", "asset_files", "asset_movements",
  "asset_movement_lines", "asset_documents", "asset_document_entries",
  "asset_document_lines", "sensitive_action_approvals", "audit_logs"
]);

function fail(message) {
  throw new Error(`PHASE10F_E1_REFUSED:${message}`);
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} inattendu`);
  }
}

function enumValuesFromPrisma() {
  const provider = Prisma.dmmf.datamodel.enums.find((entry) => entry.name === "StorageProvider");
  if (!provider) fail("enum StorageProvider absent du client Prisma Production");
  return provider.values.map((entry) => entry.name);
}

function sanitizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.port !== "5432") fail("port PostgreSQL direct 5432 obligatoire");
  if (url.searchParams.get("sslmode") !== "require") fail("sslmode=require obligatoire");
  if (url.searchParams.get("schema") !== PRODUCTION_SCHEMA) {
    fail(`schema=${PRODUCTION_SCHEMA} obligatoire`);
  }
  return url;
}

async function readCounts(tx, schema) {
  const [row] = await tx.$queryRawUnsafe(`
    SELECT
      (${TABLES.map((table) => `(SELECT COUNT(*) FROM "${schema}"."${table}")`).join(" + ")})::int AS total,
      (SELECT COUNT(*)::int FROM "${schema}"."asset_units") AS asset_units,
      (SELECT COUNT(*)::int FROM "${schema}"."asset_files") AS asset_files
  `);
  return {
    total: row.total,
    assetUnits: row.asset_units,
    assetFiles: row.asset_files
  };
}

async function readOrphans(tx, schema) {
  const [row] = await tx.$queryRawUnsafe(`
    SELECT (
      (SELECT COUNT(*) FROM "${schema}"."asset_files" f
        LEFT JOIN "${schema}"."asset_units" u ON u.id=f.asset_unit_id
        WHERE u.id IS NULL)
      + (SELECT COUNT(*) FROM "${schema}"."asset_movement_lines" l
        LEFT JOIN "${schema}"."asset_movements" m ON m.id=l.movement_id
        LEFT JOIN "${schema}"."asset_units" u ON u.id=l.asset_unit_id
        WHERE m.id IS NULL OR u.id IS NULL)
      + (SELECT COUNT(*) FROM "${schema}"."asset_document_entries" e
        LEFT JOIN "${schema}"."asset_documents" d ON d.id=e.document_id
        LEFT JOIN "${schema}"."asset_entries" source ON source.id=e.asset_entry_id
        WHERE d.id IS NULL OR source.id IS NULL)
      + (SELECT COUNT(*) FROM "${schema}"."asset_document_lines" l
        LEFT JOIN "${schema}"."asset_documents" d ON d.id=l.document_id
        LEFT JOIN "${schema}"."asset_units" u ON u.id=l.asset_unit_id
        WHERE d.id IS NULL OR (l.asset_unit_id IS NOT NULL AND u.id IS NULL))
    )::int AS count
  `);
  return row.count;
}

async function readColumns(tx, schema) {
  return tx.$queryRawUnsafe(`
    SELECT
      column_name,
      data_type,
      udt_schema,
      udt_name,
      is_nullable,
      column_default,
      datetime_precision,
      ordinal_position
    FROM information_schema.columns
    WHERE table_schema = '${schema}' AND table_name = 'asset_files'
    ORDER BY ordinal_position
  `);
}

async function readEnum(tx, schema) {
  return tx.$queryRawUnsafe(`
    SELECT e.enumlabel AS value, e.enumsortorder::float8 AS sort_order
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = '${schema}' AND t.typname = 'StorageProvider'
    ORDER BY e.enumsortorder
  `);
}

async function readEnumDependencies(tx, schema) {
  return tx.$queryRawUnsafe(`
    SELECT
      ns.nspname AS table_schema,
      cls.relname AS table_name,
      att.attname AS column_name
    FROM pg_type typ
    JOIN pg_namespace tns ON tns.oid = typ.typnamespace
    JOIN pg_attribute att ON att.atttypid = typ.oid AND att.attnum > 0
    JOIN pg_class cls ON cls.oid = att.attrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE tns.nspname = '${schema}' AND typ.typname = 'StorageProvider'
      AND cls.relkind IN ('r', 'p')
    ORDER BY ns.nspname, cls.relname, att.attname
  `);
}

async function readConstraints(tx, schema) {
  return tx.$queryRawUnsafe(`
    SELECT conname, contype, pg_get_constraintdef(oid, true) AS definition
    FROM pg_constraint
    WHERE conrelid = '"${schema}"."asset_files"'::regclass
    ORDER BY conname
  `);
}

async function readIndexes(tx, schema) {
  return tx.$queryRawUnsafe(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = '${schema}' AND tablename = 'asset_files'
    ORDER BY indexname
  `);
}

async function readHistoricalChecksum(tx, schema) {
  const [row] = await tx.$queryRawUnsafe(`
    SELECT md5(COALESCE(string_agg(
      jsonb_build_object(
        'id', id,
        'asset_unit_id', asset_unit_id,
        'file_type', file_type,
        'file_label', file_label,
        'file_name', file_name,
        'file_path', file_path,
        'mime_type', mime_type,
        'file_size', file_size,
        'is_primary', is_primary,
        'notes', notes,
        'created_by', created_by,
        'created_at', created_at,
        'deleted_at', deleted_at
      )::text,
      '|' ORDER BY id
    ), '')) AS checksum
    FROM "${schema}"."asset_files"
  `);
  return row.checksum;
}

async function readTableChecksums(tx, schema) {
  const checksums = {};
  for (const table of TABLES) {
    if (table === "asset_files") {
      checksums[table] = {
        count: (await readCounts(tx, schema)).assetFiles,
        checksum: await readHistoricalChecksum(tx, schema)
      };
      continue;
    }
    const [row] = await tx.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int AS count,
        md5(COALESCE(string_agg(to_jsonb(source)::text, '|' ORDER BY to_jsonb(source)::text), '')) AS checksum
      FROM "${schema}"."${table}" source
    `);
    checksums[table] = row;
  }
  return checksums;
}

function normalizeColumn(column) {
  return {
    name: column.column_name,
    dataType: column.data_type,
    udtName: column.udt_name,
    nullable: column.is_nullable,
    defaultValue: column.column_default,
    datetimePrecision: column.datetime_precision
  };
}

function assertStorageColumns(columns, schema) {
  const actual = columns
    .filter((column) => STORAGE_COLUMNS.some((expected) => expected.name === column.column_name))
    .map(normalizeColumn);
  const expected = STORAGE_COLUMNS.map((column) => ({
    ...column,
    datetimePrecision: column.datetimePrecision ?? null
  }));
  assertEqual(actual, expected, `${schema}.asset_files colonnes Storage`);
  const provider = columns.find((column) => column.column_name === "storage_provider");
  if (provider.udt_schema !== schema) fail(`${schema}.storage_provider utilise un enum externe`);
}

function assertHistoricalStructure(productionColumns, recipeColumns) {
  const normalize = (column) => ({
    name: column.column_name,
    dataType: column.data_type,
    udtName: column.udt_name,
    nullable: column.is_nullable,
    defaultValue: column.column_default,
    datetimePrecision: column.datetime_precision
  });
  assertEqual(
    productionColumns.slice(0, 13).map(normalize),
    recipeColumns.slice(0, 13).map(normalize),
    "structure historique asset_files Production/Recipe"
  );
}

async function inspectState(tx) {
  const [current] = await tx.$queryRawUnsafe(`
    SELECT
      current_schema() AS schema,
      current_database() AS database_name,
      EXISTS (
        SELECT 1 FROM pg_stat_ssl
        WHERE pid = pg_backend_pid() AND ssl = true
      ) AS ssl_active
  `);
  if (current.schema !== PRODUCTION_SCHEMA) fail("current_schema n'est pas immos");

  const tableExists = await tx.$queryRawUnsafe(`
    SELECT 1 AS present
    FROM information_schema.tables
    WHERE table_schema = '${PRODUCTION_SCHEMA}' AND table_name = 'asset_files'
  `);
  if (tableExists.length !== 1) fail("table immos.asset_files absente");

  const counts = {};
  const orphans = {};
  for (const schema of [PRODUCTION_SCHEMA, RECIPE_SCHEMA]) {
    counts[schema] = await readCounts(tx, schema);
    assertEqual(counts[schema], EXPECTED_TOTALS[schema], `${schema} totaux protégés`);
    orphans[schema] = await readOrphans(tx, schema);
    if (orphans[schema] !== 0) fail(`${schema} contient des FK orphelines`);
  }

  const productionColumns = await readColumns(tx, PRODUCTION_SCHEMA);
  const recipeColumns = await readColumns(tx, RECIPE_SCHEMA);
  if (productionColumns.length < 13) fail("structure historique Production incomplète");
  if (recipeColumns.length !== 17) fail("structure Recipe asset_files inattendue");
  assertHistoricalStructure(productionColumns, recipeColumns);
  assertStorageColumns(recipeColumns, RECIPE_SCHEMA);

  const recipeEnumRows = await readEnum(tx, RECIPE_SCHEMA);
  const recipeEnum = recipeEnumRows.map((row) => row.value);
  const prismaEnum = enumValuesFromPrisma();
  if (recipeEnum.length === 0) fail("enum Recipe impossible à déterminer");
  assertEqual(recipeEnum, prismaEnum, "enum Recipe/Prisma");
  const recipeEnumDependencies = await readEnumDependencies(tx, RECIPE_SCHEMA);
  assertEqual(recipeEnumDependencies, [{
    table_schema: RECIPE_SCHEMA,
    table_name: "asset_files",
    column_name: "storage_provider"
  }], "dépendances enum Recipe");

  const productionEnumRows = await readEnum(tx, PRODUCTION_SCHEMA);
  const productionEnum = productionEnumRows.map((row) => row.value);
  const productionStorageColumns = productionColumns.filter((column) =>
    STORAGE_COLUMNS.some((expected) => expected.name === column.column_name)
  );
  if (![0, 4].includes(productionStorageColumns.length)) {
    fail("alignement partiel des colonnes Storage détecté");
  }
  if (productionEnum.length > 0) {
    assertEqual(productionEnum, recipeEnum, "enum Production/Recipe");
  }
  if (productionStorageColumns.length === 4) {
    if (productionEnum.length === 0) fail("colonnes présentes sans enum Production");
    assertStorageColumns(productionColumns, PRODUCTION_SCHEMA);
  }

  return {
    current,
    counts,
    orphans,
    productionColumns,
    recipeColumns,
    recipeEnum,
    recipeEnumDependencies,
    productionEnum,
    constraints: await readConstraints(tx, PRODUCTION_SCHEMA),
    indexes: await readIndexes(tx, PRODUCTION_SCHEMA),
    historicalChecksum: await readHistoricalChecksum(tx, PRODUCTION_SCHEMA),
    productionTableChecksums: await readTableChecksums(tx, PRODUCTION_SCHEMA),
    recipeTableChecksums: await readTableChecksums(tx, RECIPE_SCHEMA)
  };
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const env = await loadSupabaseEnv();
const directUrl = sanitizeUrl(env.SUPABASE_DIRECT_URL);
const modelSchemas = [...new Set(Prisma.dmmf.datamodel.models.map((model) => model.schema))];
assertEqual(modelSchemas, [PRODUCTION_SCHEMA], "schéma du client Prisma Production");
const mode = process.env.PHASE10F_E1_MODE || "INSPECT";
if (!["INSPECT", "EXECUTE"].includes(mode)) {
  fail("PHASE10F_E1_MODE doit valoir INSPECT ou EXECUTE");
}
if (
  mode === "EXECUTE" &&
  process.env.PHASE10F_E1_CONFIRM_PRODUCTION !== "ALIGN_IMMOS_STORAGE_COLUMNS"
) {
  fail("confirmation explicite PHASE10F_E1_CONFIRM_PRODUCTION absente");
}

const prisma = new PrismaClient({ datasourceUrl: directUrl.toString(), errorFormat: "minimal" });
try {
  const result = await prisma.$transaction(async (tx) => {
    if (mode === "INSPECT") {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    }
    await tx.$queryRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('phase10f-e1:immos:asset_files:storage-alignment'))::text AS locked"
    );
    const before = await inspectState(tx);
    const alreadyAligned =
      before.productionEnum.length > 0 &&
      before.productionColumns.filter((column) =>
        STORAGE_COLUMNS.some((expected) => expected.name === column.column_name)
      ).length === 4;

    if (mode === "INSPECT") {
      return {
        status: alreadyAligned ? "ALREADY_ALIGNED" : "READY_TO_ALIGN",
        mode,
        recipeEnum: before.recipeEnum,
        recipeEnumDependencies: before.recipeEnumDependencies,
        productionEnum: before.productionEnum,
        productionStorageColumnCount: before.productionColumns.length - 13,
        productionCounts: before.counts[PRODUCTION_SCHEMA],
        recipeCounts: before.counts[RECIPE_SCHEMA],
        productionOrphans: before.orphans[PRODUCTION_SCHEMA],
        recipeOrphans: before.orphans[RECIPE_SCHEMA],
        historicalChecksum: before.historicalChecksum,
        productionSnapshot: sha256(before.productionTableChecksums),
        recipeSnapshot: sha256(before.recipeTableChecksums)
      };
    }

    const executed = [];
    if (!alreadyAligned) {
      if (before.productionEnum.length === 0) {
        const enumSql = `CREATE TYPE "immos"."StorageProvider" AS ENUM (${before.recipeEnum
          .map((value) => `'${value.replaceAll("'", "''")}'`)
          .join(", ")})`;
        await tx.$executeRawUnsafe(enumSql);
        executed.push(enumSql);
      }
      const statements = [
        `ALTER TABLE "immos"."asset_files" ADD COLUMN "storage_provider" "immos"."StorageProvider"`,
        `ALTER TABLE "immos"."asset_files" ADD COLUMN "storage_bucket" text`,
        `ALTER TABLE "immos"."asset_files" ADD COLUMN "storage_key" text`,
        `ALTER TABLE "immos"."asset_files" ADD COLUMN "updated_at" timestamptz(3) NOT NULL`
      ];
      for (const statement of statements) {
        await tx.$executeRawUnsafe(statement);
        executed.push(statement);
      }
    }

    const after = await inspectState(tx);
    assertEqual(after.productionEnum, before.recipeEnum, "enum Production après création");
    assertStorageColumns(after.productionColumns, PRODUCTION_SCHEMA);
    assertEqual(after.counts, before.counts, "totaux avant/après");
    assertEqual(after.orphans, before.orphans, "FK orphelines avant/après");
    assertEqual(after.constraints, before.constraints, "contraintes historiques avant/après");
    assertEqual(after.indexes, before.indexes, "index historiques avant/après");
    assertEqual(after.historicalChecksum, before.historicalChecksum, "checksum asset_files historique");
    assertEqual(
      after.productionTableChecksums,
      before.productionTableChecksums,
      "checksums tables Production"
    );
    assertEqual(after.recipeTableChecksums, before.recipeTableChecksums, "checksums tables Recipe");

    return {
      status: alreadyAligned ? "ALREADY_ALIGNED" : "ALIGNED",
      executed,
      recipeEnum: before.recipeEnum,
      recipeEnumDependencies: before.recipeEnumDependencies,
      productionCounts: after.counts[PRODUCTION_SCHEMA],
      recipeCounts: after.counts[RECIPE_SCHEMA],
      productionOrphans: after.orphans[PRODUCTION_SCHEMA],
      recipeOrphans: after.orphans[RECIPE_SCHEMA],
      productionColumnCountBefore: before.productionColumns.length,
      productionColumnCountAfter: after.productionColumns.length,
      historicalChecksumBefore: before.historicalChecksum,
      historicalChecksumAfter: after.historicalChecksum,
      productionSnapshotBefore: sha256(before.productionTableChecksums),
      productionSnapshotAfter: sha256(after.productionTableChecksums),
      recipeSnapshotBefore: sha256(before.recipeTableChecksums),
      recipeSnapshotAfter: sha256(after.recipeTableChecksums),
      constraintsPreserved: true,
      indexesPreserved: true
    };
  }, {
    isolationLevel: "Serializable",
    maxWait: 10_000,
    timeout: 120_000
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
