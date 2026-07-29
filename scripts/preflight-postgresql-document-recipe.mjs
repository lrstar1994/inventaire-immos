import { PrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const CAMPAIGN = "PG-RECIPE-PHASE8-20260729034635";
const MOVEMENT_ID = "cms5k4pgx0001v5ckzffmjdzh";
const UNIT_ID = "cms5jogls000rv5zw49j8a13s";
const TARGET_LOCATION_ID = "cms5jn62k0005v5zw63q3jdhk";
const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
url.searchParams.set("schema", "immos_recipe_phase8");
const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });

try {
  const startedAt = performance.now();
  const [one] = await prisma.$queryRaw`SELECT 1::int AS value, current_schema() AS schema`;
  const [totals] = await prisma.$queryRaw`
    SELECT
      ((SELECT COUNT(*) FROM "immos_recipe_phase8"."users") +
       (SELECT COUNT(*) FROM "immos_recipe_phase8"."suppliers") +
       (SELECT COUNT(*) FROM "immos_recipe_phase8"."locations") +
       (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_categories") +
       (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_items") +
       (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_entries") +
       (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_units") +
       (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_files") +
       (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_movements") +
       (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_movement_lines") +
       (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_documents") +
       (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_document_entries") +
       (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_document_lines") +
       (SELECT COUNT(*) FROM "immos_recipe_phase8"."sensitive_action_approvals") +
       (SELECT COUNT(*) FROM "immos_recipe_phase8"."audit_logs"))::int AS recipe_total,
      ((SELECT COUNT(*) FROM "immos"."users") +
       (SELECT COUNT(*) FROM "immos"."suppliers") +
       (SELECT COUNT(*) FROM "immos"."locations") +
       (SELECT COUNT(*) FROM "immos"."asset_categories") +
       (SELECT COUNT(*) FROM "immos"."asset_items") +
       (SELECT COUNT(*) FROM "immos"."asset_entries") +
       (SELECT COUNT(*) FROM "immos"."asset_units") +
       (SELECT COUNT(*) FROM "immos"."asset_files") +
       (SELECT COUNT(*) FROM "immos"."asset_movements") +
       (SELECT COUNT(*) FROM "immos"."asset_movement_lines") +
       (SELECT COUNT(*) FROM "immos"."asset_documents") +
       (SELECT COUNT(*) FROM "immos"."asset_document_entries") +
       (SELECT COUNT(*) FROM "immos"."asset_document_lines") +
       (SELECT COUNT(*) FROM "immos"."sensitive_action_approvals") +
       (SELECT COUNT(*) FROM "immos"."audit_logs"))::int AS reference_total`;
  const [movement, unit, validationAudits, documents, documentAudits, assetFiles] = await Promise.all([
    prisma.assetMovement.findUnique({ where: { id: MOVEMENT_ID }, select: { movementStatus: true } }),
    prisma.assetUnit.findUnique({ where: { id: UNIT_ID }, select: { locationId: true } }),
    prisma.auditLog.count({
      where: {
        OR: [
          { action: "ASSET_MOVEMENT_VALIDATED", entityId: MOVEMENT_ID },
          { action: "ASSET_UNIT_LOCATION_UPDATED_BY_MOVEMENT", entityId: UNIT_ID }
        ]
      }
    }),
    prisma.assetDocument.count({
      where: { documentType: "ENTRY_SLIP", OR: [{ title: { contains: CAMPAIGN } }, { notes: { contains: CAMPAIGN } }] }
    }),
    prisma.auditLog.count({ where: { action: "ASSET_DOCUMENT_FROM_ENTRIES_CREATED", metadata: { contains: CAMPAIGN } } }),
    prisma.assetFile.count()
  ]);
  const result = {
    result: "DOCUMENT_RECIPE_PREFLIGHT_OK",
    durationMs: Math.round(performance.now() - startedAt),
    selectOne: one.value,
    currentSchema: one.schema,
    totals,
    movementStatus: movement?.movementStatus,
    unitAtExpectedLocation: unit?.locationId === TARGET_LOCATION_ID,
    validationAudits,
    campaignEntrySlipDocuments: documents,
    campaignDocumentAudits: documentAudits,
    assetFiles
  };
  console.log(JSON.stringify(result, null, 2));
  if (one.schema !== "immos_recipe_phase8" || totals.recipe_total !== 247 ||
      totals.reference_total !== 222 || movement?.movementStatus !== "VALIDATED" ||
      unit?.locationId !== TARGET_LOCATION_ID || validationAudits !== 2 ||
      documents !== 0 || documentAudits !== 0 || assetFiles !== 0) {
    throw new Error("Prévol documentaire non conforme.");
  }
} finally {
  await prisma.$disconnect();
}
