import { PrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const MOVEMENT_ID = "cms5k4pgx0001v5ckzffmjdzh";
const UNIT_ID = "cms5jogls000rv5zw49j8a13s";
const ORIGINAL_LOCATION_ID = "cms5jnaj40009v5zwxz50blnq";
const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
url.searchParams.set("schema", "immos_recipe_phase8");
const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });
const tables = [
  "users", "suppliers", "locations", "asset_categories", "asset_items", "asset_entries",
  "asset_units", "asset_files", "asset_movements", "asset_movement_lines", "asset_documents",
  "asset_document_entries", "asset_document_lines", "sensitive_action_approvals", "audit_logs"
];

try {
  const [schema] = await prisma.$queryRaw`SELECT current_schema() AS schema`;
  const [recipeTotal] = await prisma.$queryRawUnsafe(
    `SELECT (${tables.map((table) => `(SELECT COUNT(*) FROM "immos_recipe_phase8"."${table}")`).join(" + ")})::int AS total`
  );
  const [referenceTotal] = await prisma.$queryRawUnsafe(
    `SELECT (${tables.map((table) => `(SELECT COUNT(*) FROM "immos"."${table}")`).join(" + ")})::int AS total`
  );
  const [movement, unit, validationAudits, assetFiles] = await Promise.all([
    prisma.assetMovement.findUnique({ where: { id: MOVEMENT_ID }, include: { lines: true } }),
    prisma.assetUnit.findUnique({ where: { id: UNIT_ID }, select: { id: true, locationId: true, status: true } }),
    prisma.auditLog.count({
      where: {
        OR: [
          { action: "ASSET_MOVEMENT_VALIDATED", entityId: MOVEMENT_ID },
          { action: "ASSET_UNIT_LOCATION_UPDATED_BY_MOVEMENT", entityId: UNIT_ID }
        ]
      }
    }),
    prisma.assetFile.count()
  ]);
  const result = {
    schema: schema.schema,
    recipeTotal: recipeTotal.total,
    referenceTotal: referenceTotal.total,
    assetFiles,
    movementStatus: movement?.movementStatus,
    movementLineCount: movement?.lines.length,
    unitLocationId: unit?.locationId,
    unitStatus: unit?.status,
    validationAudits
  };
  console.log(JSON.stringify(result, null, 2));
  if (schema.schema !== "immos_recipe_phase8" || recipeTotal.total !== 245 ||
      referenceTotal.total !== 222 || assetFiles !== 0 || movement?.movementStatus !== "DRAFT" ||
      movement?.lines.length !== 1 || unit?.locationId !== ORIGINAL_LOCATION_ID || validationAudits !== 0) {
    throw new Error("Prévol validation du mouvement non conforme.");
  }
} finally {
  await prisma.$disconnect();
}
