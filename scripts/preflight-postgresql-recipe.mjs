import { Prisma, PrismaClient } from "../generated/prisma-recipe/index.js";

const EXPECTED_SCHEMA = "immos_recipe_phase8";
const expectedRecipeTotal = Number.parseInt(process.env.RECIPE_EXPECTED_TOTAL_ROWS || "222", 10);
if (!Number.isInteger(expectedRecipeTotal) || expectedRecipeTotal < 0) {
  throw new Error("Prévol recette refusé : RECIPE_EXPECTED_TOTAL_ROWS invalide.");
}
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

const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });
const TABLES = [
  "users", "suppliers", "locations", "asset_categories", "asset_items", "asset_entries",
  "asset_units", "asset_files", "asset_movements", "asset_movement_lines", "asset_documents",
  "asset_document_entries", "asset_document_lines", "sensitive_action_approvals", "audit_logs"
];
try {
  const [schema] = await prisma.$queryRaw`SELECT current_schema() AS schema`;
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
  if (totals[EXPECTED_SCHEMA] !== expectedRecipeTotal || totals.immos !== 222) {
    throw new Error(`Prévol recette refusé : totaux attendus ${expectedRecipeTotal}/222, obtenus ${totals[EXPECTED_SCHEMA]}/${totals.immos}.`);
  }
  console.log(JSON.stringify({
    result: "RECIPE_PREFLIGHT_OK",
    provider: "postgresql",
    client: "recipe",
    generatedClient: "generated/prisma-recipe",
    modelSchema: modelSchemas[0],
    currentSchema: schema.schema,
    totals
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
