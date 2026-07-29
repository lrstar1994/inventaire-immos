import { PrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const CAMPAIGN = "PG-RECIPE-PHASE8-20260729034635";
const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
url.searchParams.set("schema", "immos_recipe_phase8");
const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });

try {
  const [schema] = await prisma.$queryRaw`SELECT current_schema() AS schema`;
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
  const [campaignDocuments, campaignAudits, assetFiles] = await Promise.all([
    prisma.assetDocument.count({
      where: { OR: [{ title: { contains: CAMPAIGN } }, { notes: { contains: CAMPAIGN } }] }
    }),
    prisma.auditLog.count({
      where: { metadata: { contains: CAMPAIGN } }
    }),
    prisma.assetFile.count()
  ]);
  const result = { schema: schema.schema, totals, campaignDocuments, campaignAudits, assetFiles };
  console.log(JSON.stringify(result, null, 2));
  if (schema.schema !== "immos_recipe_phase8" || totals.recipe_total !== 247 ||
      totals.reference_total !== 222 || campaignDocuments !== 0 || assetFiles !== 0) {
    throw new Error("Rollback documentaire non conforme.");
  }
} finally {
  await prisma.$disconnect();
}
