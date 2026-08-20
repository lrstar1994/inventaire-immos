import { Prisma, PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const STORAGE_COLUMNS = Object.freeze([
  ["storage_provider", "USER-DEFINED", "StorageProvider", "YES"],
  ["storage_bucket", "text", "text", "YES"],
  ["storage_key", "text", "text", "YES"],
  ["updated_at", "timestamp with time zone", "timestamptz", "NO"]
]);

const PROTECTED_MINIMUMS = Object.freeze({
  users: 5,
  locations: 110,
  assetCategories: 582,
  assetItems: 477,
  assetEntries: 10,
  assetUnits: 12,
  assetMovements: 11,
  assetDocuments: 14
});

export function buildProductionRuntimeUrl(raw) {
  const target = new URL(raw);

  if (!["postgres:", "postgresql:"].includes(target.protocol)) {
    throw new Error("PostgreSQL obligatoire.");
  }

  if (target.port !== "6543") {
    throw new Error("Pooler Transaction 6543 obligatoire.");
  }

  if (target.searchParams.get("sslmode") !== "require") {
    throw new Error("sslmode=require obligatoire.");
  }

  if (target.searchParams.get("schema") !== "immos") {
    throw new Error("schema=immos obligatoire.");
  }

  target.searchParams.set("pgbouncer", "true");
  target.searchParams.set("connection_limit", "1");
  target.searchParams.set("pool_timeout", "60");

  return target;
}

async function main() {
  if (
    process.env.APP_DATABASE_PROVIDER &&
    process.env.APP_DATABASE_PROVIDER !== "postgresql"
  ) {
    throw new Error("APP_DATABASE_PROVIDER=postgresql obligatoire.");
  }

  if (
    process.env.APP_PRISMA_CLIENT &&
    process.env.APP_PRISMA_CLIENT !== "normal"
  ) {
    throw new Error("APP_PRISMA_CLIENT=normal obligatoire.");
  }

  const env = await loadSupabaseEnv();
  const target = buildProductionRuntimeUrl(env.SUPABASE_DATABASE_URL);

  const prisma = new PrismaClient({
    datasourceUrl: target.toString(),
    errorFormat: "minimal"
  });

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");

      const [identity] = await tx.$queryRaw`
        SELECT
          1::int AS value,
          current_schema() AS schema
      `;

      if (identity?.value !== 1 || identity?.schema !== "immos") {
        throw new Error("Identité PostgreSQL Production inattendue.");
      }

      const [counts] = await tx.$queryRawUnsafe(`
        SELECT
          (SELECT COUNT(*)::int FROM "immos"."users") AS users,
          (SELECT COUNT(*)::int FROM "immos"."locations") AS locations,
          (SELECT COUNT(*)::int FROM "immos"."asset_categories") AS asset_categories,
          (SELECT COUNT(*)::int FROM "immos"."asset_items") AS asset_items,
          (SELECT COUNT(*)::int FROM "immos"."asset_entries") AS asset_entries,
          (SELECT COUNT(*)::int FROM "immos"."asset_units") AS asset_units,
          (SELECT COUNT(*)::int FROM "immos"."asset_files") AS asset_files,
          (SELECT COUNT(*)::int FROM "immos"."asset_movements") AS asset_movements,
          (SELECT COUNT(*)::int FROM "immos"."asset_documents") AS asset_documents
      `);

      if (
        counts.users < PROTECTED_MINIMUMS.users ||
        counts.locations < PROTECTED_MINIMUMS.locations ||
        counts.asset_categories < PROTECTED_MINIMUMS.assetCategories ||
        counts.asset_items < PROTECTED_MINIMUMS.assetItems ||
        counts.asset_entries < PROTECTED_MINIMUMS.assetEntries ||
        counts.asset_units < PROTECTED_MINIMUMS.assetUnits ||
        counts.asset_movements < PROTECTED_MINIMUMS.assetMovements ||
        counts.asset_documents < PROTECTED_MINIMUMS.assetDocuments ||
        counts.asset_files !== 0
      ) {
        throw new Error("Volumes minimums Production protégés inattendus.");
      }

      const [phase13c] = await tx.$queryRawUnsafe(`
        SELECT
          to_regclass('immos.quantitative_stock_positions') IS NOT NULL
            AS quantitative_stock_positions,
          to_regclass('immos.quantitative_movement_lines') IS NOT NULL
            AS quantitative_movement_lines,
          to_regclass('immos.equipment_sets') IS NOT NULL
            AS equipment_sets,
          to_regclass('immos.equipment_set_components') IS NOT NULL
            AS equipment_set_components
      `);

      if (
        !phase13c.quantitative_stock_positions ||
        !phase13c.quantitative_movement_lines ||
        !phase13c.equipment_sets ||
        !phase13c.equipment_set_components
      ) {
        throw new Error("Socle 13C Production incomplet.");
      }

      const [orphans] = await tx.$queryRawUnsafe(`
        SELECT (
          (
            SELECT COUNT(*)
            FROM "immos"."asset_files" f
            LEFT JOIN "immos"."asset_units" u
              ON u.id = f.asset_unit_id
            WHERE u.id IS NULL
          )
          +
          (
            SELECT COUNT(*)
            FROM "immos"."asset_movement_lines" l
            LEFT JOIN "immos"."asset_movements" m
              ON m.id = l.movement_id
            LEFT JOIN "immos"."asset_units" u
              ON u.id = l.asset_unit_id
            WHERE m.id IS NULL
              OR u.id IS NULL
          )
          +
          (
            SELECT COUNT(*)
            FROM "immos"."asset_document_entries" e
            LEFT JOIN "immos"."asset_documents" d
              ON d.id = e.document_id
            LEFT JOIN "immos"."asset_entries" a
              ON a.id = e.asset_entry_id
            WHERE d.id IS NULL
              OR a.id IS NULL
          )
          +
          (
            SELECT COUNT(*)
            FROM "immos"."asset_document_lines" l
            LEFT JOIN "immos"."asset_documents" d
              ON d.id = l.document_id
            LEFT JOIN "immos"."asset_units" u
              ON u.id = l.asset_unit_id
            WHERE d.id IS NULL
              OR (
                l.asset_unit_id IS NOT NULL
                AND u.id IS NULL
              )
          )
        )::int AS count
      `);

      if (orphans.count !== 0) {
        throw new Error("FK orphelines Production détectées.");
      }

      const columns = await tx.$queryRawUnsafe(`
        SELECT
          column_name,
          data_type,
          udt_schema,
          udt_name,
          is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'immos'
          AND table_name = 'asset_files'
          AND column_name IN (
            'storage_provider',
            'storage_bucket',
            'storage_key',
            'updated_at'
          )
        ORDER BY ordinal_position
      `);

      const normalized = columns.map((column) => [
        column.column_name,
        column.data_type,
        column.udt_name,
        column.is_nullable
      ]);

      if (
        JSON.stringify(normalized) !== JSON.stringify(STORAGE_COLUMNS) ||
        columns[0]?.udt_schema !== "immos"
      ) {
        throw new Error("Colonnes Storage Production incompatibles.");
      }

      const enumRows = await tx.$queryRawUnsafe(`
        SELECT
          e.enumlabel AS value
        FROM pg_type t
        JOIN pg_namespace n
          ON n.oid = t.typnamespace
        JOIN pg_enum e
          ON e.enumtypid = t.oid
        WHERE n.nspname = 'immos'
          AND t.typname = 'StorageProvider'
        ORDER BY e.enumsortorder
      `);

      const prismaEnum = Prisma.dmmf.datamodel.enums
        .find((entry) => entry.name === "StorageProvider")
        ?.values.map((entry) => entry.name);

      if (
        !prismaEnum ||
        JSON.stringify(enumRows.map((row) => row.value)) !==
          JSON.stringify(prismaEnum)
      ) {
        throw new Error("Enum StorageProvider Production incompatible.");
      }

      return {
        schema: identity.schema,
        users: counts.users,
        locations: counts.locations,
        assetCategories: counts.asset_categories,
        assetItems: counts.asset_items,
        assetEntries: counts.asset_entries,
        assetUnits: counts.asset_units,
        assetFiles: counts.asset_files,
        assetMovements: counts.asset_movements,
        assetDocuments: counts.asset_documents,
        quantitativeStockPositionsTable:
          phase13c.quantitative_stock_positions,
        quantitativeMovementLinesTable:
          phase13c.quantitative_movement_lines,
        equipmentSetsTable:
          phase13c.equipment_sets,
        equipmentSetComponentsTable:
          phase13c.equipment_set_components,
        foreignKeyOrphans: orphans.count,
        storageColumns: columns.length,
        storageProviderValues: enumRows.length
      };
    });

    console.log(
      JSON.stringify(
        {
          result: "PRODUCTION_PREFLIGHT_OK",
          provider: "postgresql",
          client: "generated/prisma-postgresql",
          port: 6543,
          pooler: "transaction",
          ...result
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url ===
    new URL(`file:///${process.argv[1].replaceAll("\\", "/")}`).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Prévol Production échoué."
    );
    process.exitCode = 1;
  });
}