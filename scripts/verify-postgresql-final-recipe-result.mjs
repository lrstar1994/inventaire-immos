import { PrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const IDS = {
  supplier: "cms5jmm600000v5zwu34a5y0w",
  document: "cms5p313k0000v5qo7b1vv0y2",
  movement: "cms5k4pgx0001v5ckzffmjdzh",
  unit: "cms5jogls000rv5zw49j8a13s"
};
const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
url.searchParams.set("schema", "immos_recipe_phase8");
const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });

try {
  const [document, supplier, movement, unit, documentCreatedAudits, documentValidatedAudits,
    supplierAudits, assetFiles] = await Promise.all([
    prisma.assetDocument.findUnique({ where: { id: IDS.document }, include: { entries: true, lines: true } }),
    prisma.supplier.findUnique({ where: { id: IDS.supplier } }),
    prisma.assetMovement.findUnique({ where: { id: IDS.movement } }),
    prisma.assetUnit.findUnique({ where: { id: IDS.unit } }),
    prisma.auditLog.count({ where: { action: "ASSET_DOCUMENT_FROM_ENTRIES_CREATED", entityId: IDS.document } }),
    prisma.auditLog.count({ where: { action: "ASSET_DOCUMENT_VALIDATED", entityId: IDS.document } }),
    prisma.auditLog.count({ where: { action: "SUPPLIERS_DISABLED", entityId: IDS.supplier } }),
    prisma.assetFile.count()
  ]);
  const tableCounts = await prisma.$queryRaw`
    SELECT
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."users") AS users,
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."suppliers") AS suppliers,
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."locations") AS locations,
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_categories") AS asset_categories,
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_items") AS asset_items,
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_entries") AS asset_entries,
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_units") AS asset_units,
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_files") AS asset_files,
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_movements") AS asset_movements,
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_movement_lines") AS asset_movement_lines,
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_documents") AS asset_documents,
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_document_entries") AS asset_document_entries,
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."asset_document_lines") AS asset_document_lines,
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."sensitive_action_approvals") AS sensitive_action_approvals,
      (SELECT COUNT(*)::int FROM "immos_recipe_phase8"."audit_logs") AS audit_logs`;
  const counts = tableCounts[0];
  const recipeTotal = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const [invalid] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count FROM (
      SELECT 1 FROM "immos_recipe_phase8"."asset_document_entries" de
      LEFT JOIN "immos_recipe_phase8"."asset_documents" d ON d.id=de.document_id
      LEFT JOIN "immos_recipe_phase8"."asset_entries" e ON e.id=de.asset_entry_id
      WHERE d.id IS NULL OR e.id IS NULL
      UNION ALL
      SELECT 1 FROM "immos_recipe_phase8"."asset_document_lines" dl
      LEFT JOIN "immos_recipe_phase8"."asset_documents" d ON d.id=dl.document_id
      LEFT JOIN "immos_recipe_phase8"."asset_units" u ON u.id=dl.asset_unit_id
      WHERE d.id IS NULL OR u.id IS NULL
      UNION ALL
      SELECT 1 FROM "immos_recipe_phase8"."asset_movement_lines" ml
      LEFT JOIN "immos_recipe_phase8"."asset_movements" m ON m.id=ml.movement_id
      LEFT JOIN "immos_recipe_phase8"."asset_units" u ON u.id=ml.asset_unit_id
      WHERE m.id IS NULL OR u.id IS NULL
    ) invalid`;
  const result = {
    recipeTotal,
    tableCounts: counts,
    document: {
      id: document?.id,
      number: document?.documentNumber,
      status: document?.status,
      entryCount: document?.entries.length,
      lineCount: document?.lines.length
    },
    supplier: {
      id: supplier?.id,
      status: supplier?.status,
      logicallyDeleted: Boolean(supplier?.deletedAt)
    },
    movementStatus: movement?.movementStatus,
    unitLocationId: unit?.locationId,
    audits: { documentCreatedAudits, documentValidatedAudits, supplierAudits },
    foreignKeyViolations: invalid.count,
    assetFiles
  };
  console.log(JSON.stringify(result, null, 2));
  if (recipeTotal !== 253 || document?.status !== "VALIDATED" ||
      document.entries.length !== 1 || document.lines.length !== 1 ||
      supplier?.status !== "DISABLED" || !supplier.deletedAt ||
      movement?.movementStatus !== "VALIDATED" ||
      documentCreatedAudits !== 1 || documentValidatedAudits !== 1 ||
      supplierAudits !== 1 || invalid.count !== 0 || assetFiles !== 0) {
    throw new Error("État final de recette non conforme.");
  }
} finally {
  await prisma.$disconnect();
}
