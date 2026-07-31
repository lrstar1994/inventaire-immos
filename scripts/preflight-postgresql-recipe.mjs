import { Prisma, PrismaClient } from "../generated/prisma-recipe/index.js";
import {
  assertPostgreSQLRecipeProtectedBaseline,
  POSTGRESQL_RECIPE_PROTECTED_BASELINE
} from "./postgresql-recipe-protected-baseline.mjs";

const EXPECTED_SCHEMA = "immos_recipe_phase8";
if (process.env.APP_DATABASE_PROVIDER !== "postgresql") {
  throw new Error("Prévol recette refusé : APP_DATABASE_PROVIDER doit valoir postgresql.");
}
if (!process.env.APP_PRISMA_CLIENT) {
  throw new Error("Prévol recette refusé : APP_PRISMA_CLIENT est absent.");
}
if (process.env.APP_PRISMA_CLIENT !== "recipe") {
  throw new Error("Prévol recette refusé : APP_PRISMA_CLIENT doit valoir recipe.");
}
if (!process.env.SUPABASE_DATABASE_URL) {
  throw new Error("Prévol recette refusé : URL PostgreSQL absente.");
}

const url = new URL(process.env.SUPABASE_DATABASE_URL);
if (url.port !== "5432" || url.searchParams.get("sslmode") !== "require") {
  throw new Error("Prévol recette refusé : session 5432 avec sslmode=require obligatoire.");
}
if (url.searchParams.get("schema") !== EXPECTED_SCHEMA) {
  throw new Error(`Prévol recette refusé : schema=${EXPECTED_SCHEMA} obligatoire.`);
}
const modelSchemas = [...new Set(Prisma.dmmf.datamodel.models.map((model) => model.schema))];
if (modelSchemas.length !== 1 || modelSchemas[0] !== EXPECTED_SCHEMA) {
  throw new Error("Prévol recette refusé : le client généré chargé n'est pas le client recipe.");
}

const skipNetworkPreflight = process.env.RECIPE_SKIP_PREFLIGHT === "1";
if (skipNetworkPreflight && process.env.RECIPE_PREFLIGHT_DEVELOPMENT !== "1") {
  throw new Error(
    "Prevol recette refuse : RECIPE_SKIP_PREFLIGHT=1 est autorise uniquement par la commande de developpement."
  );
}
if (skipNetworkPreflight) {
  console.warn([
    "",
    "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
    "AVERTISSEMENT : PREVOL RESEAU POSTGRESQL RECIPE VOLONTAIREMENT IGNORE",
    "LA RECETTE DISTANTE N'EST PAS VALIDEE DANS CE MODE.",
    "Les garde-fous de configuration, de schema et de client restent actifs.",
    "L'application peut demarrer, mais les pages PostgreSQL echoueront tant que",
    "la connectivite Supabase ne sera pas retablie. SQLite locale n'est pas concernee.",
    "Aucune donnee n'a ete modifiee par ce contournement.",
    "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
    ""
  ].join("\n"));
  process.exit(0);
}

const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });
const TABLES = [
  "users", "suppliers", "locations", "asset_categories", "asset_items", "asset_entries",
  "asset_units", "asset_files", "asset_movements", "asset_movement_lines", "asset_documents",
  "asset_document_entries", "asset_document_lines", "sensitive_action_approvals", "audit_logs"
];
try {
  let schema;
  try {
    [schema] = await prisma.$queryRaw`SELECT current_schema() AS schema`;
  } catch {
    throw new Error([
      "Prevol recette refuse : impossible de joindre PostgreSQL Supabase.",
      "Cause probable : probleme reseau ou connectivite PostgreSQL temporairement indisponible.",
      "SQLite locale n'est pas concernee et reste utilisable.",
      "Aucune donnee n'a ete modifiee."
    ].join(" "));
  }
  if (schema.schema !== EXPECTED_SCHEMA) {
    throw new Error(`Prévol recette refusé : current_schema=${schema.schema}.`);
  }
  const totals = {};
  for (const targetSchema of [EXPECTED_SCHEMA, "immos"]) {
    const [row] = await prisma.$queryRawUnsafe(
      `SELECT (${TABLES.map((table) => `(SELECT COUNT(*) FROM "${targetSchema}"."${table}")`).join(" + ")})::int AS total`
    );
    totals[targetSchema] = row.total;
  }
  const [protectedCounts] = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_units") AS recipe_asset_units,
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_files") AS recipe_asset_files,
      (SELECT COUNT(*)::int FROM "immos"."asset_units") AS production_asset_units,
      (SELECT COUNT(*)::int FROM "immos"."asset_files") AS production_asset_files,
      (
        (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_files" f
          LEFT JOIN "immos_recipe_phase8"."asset_units" u ON u.id=f.asset_unit_id
          WHERE u.id IS NULL)
        + (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_movement_lines" l
          LEFT JOIN "immos_recipe_phase8"."asset_movements" m ON m.id=l.movement_id
          LEFT JOIN "immos_recipe_phase8"."asset_units" u ON u.id=l.asset_unit_id
          WHERE m.id IS NULL OR u.id IS NULL)
        + (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_document_entries" e
          LEFT JOIN "immos_recipe_phase8"."asset_documents" d ON d.id=e.document_id
          LEFT JOIN "immos_recipe_phase8"."asset_entries" source ON source.id=e.asset_entry_id
          WHERE d.id IS NULL OR source.id IS NULL)
        + (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_document_lines" l
          LEFT JOIN "immos_recipe_phase8"."asset_documents" d ON d.id=l.document_id
          LEFT JOIN "immos_recipe_phase8"."asset_units" u ON u.id=l.asset_unit_id
          WHERE d.id IS NULL OR (l.asset_unit_id IS NOT NULL AND u.id IS NULL))
      )::int AS recipe_foreign_key_orphans
  `);
  const snapshot = assertPostgreSQLRecipeProtectedBaseline({
    recipeTotal: totals[EXPECTED_SCHEMA],
    productionTotal: totals.immos,
    recipeAssetUnits: protectedCounts.recipe_asset_units,
    recipeAssetFiles: protectedCounts.recipe_asset_files,
    productionAssetUnits: protectedCounts.production_asset_units,
    productionAssetFiles: protectedCounts.production_asset_files,
    recipeForeignKeyOrphans: protectedCounts.recipe_foreign_key_orphans
  });
  console.log(JSON.stringify({
    result: "RECIPE_PREFLIGHT_OK",
    provider: "postgresql",
    client: "recipe",
    generatedClient: "generated/prisma-recipe",
    modelSchema: modelSchemas[0],
    currentSchema: schema.schema,
    totals,
    protectedBaseline: POSTGRESQL_RECIPE_PROTECTED_BASELINE,
    protectedSnapshot: snapshot
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
