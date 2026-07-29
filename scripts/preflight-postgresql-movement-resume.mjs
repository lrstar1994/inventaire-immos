import { PrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const CAMPAIGN = "PG-RECIPE-PHASE8-20260729034635";
const UNIT_ID = "cms5jogls000rv5zw49j8a13s";
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
  const [assetFiles, unit, movements, movementAudits] = await Promise.all([
    prisma.assetFile.count(),
    prisma.assetUnit.findUnique({ where: { id: UNIT_ID }, select: { id: true, locationId: true, status: true } }),
    prisma.assetMovement.count({ where: { OR: [{ reason: { contains: CAMPAIGN } }, { notes: { contains: CAMPAIGN } }] } }),
    prisma.auditLog.count({ where: { action: { startsWith: "ASSET_MOVEMENT" }, metadata: { contains: CAMPAIGN } } })
  ]);
  const result = {
    schema: schema.schema,
    recipeTotal: recipeTotal.total,
    referenceTotal: referenceTotal.total,
    assetFiles,
    unitPresent: Boolean(unit),
    campaignMovementCount: movements,
    campaignMovementAuditCount: movementAudits
  };
  console.log(JSON.stringify(result, null, 2));
  if (schema.schema !== "immos_recipe_phase8" || recipeTotal.total !== 241 ||
      referenceTotal.total !== 222 || assetFiles !== 0 || !unit || movements !== 0 || movementAudits !== 0) {
    throw new Error("Prévol reprise mouvement non conforme.");
  }
} finally {
  await prisma.$disconnect();
}
