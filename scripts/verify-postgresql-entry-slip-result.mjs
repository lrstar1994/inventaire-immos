import { PrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const DOCUMENT_ID = "cms5p313k0000v5qo7b1vv0y2";
const ENTRY_ID = "cms5jofzg000qv5zw2wfj99wz";
const UNIT_ID = "cms5jogls000rv5zw49j8a13s";
const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
url.searchParams.set("schema", "immos_recipe_phase8");
const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });

try {
  const document = await prisma.assetDocument.findUnique({
    where: { id: DOCUMENT_ID },
    include: { entries: true, lines: true }
  });
  const [sameNumberCount, auditCount, assetFiles] = await Promise.all([
    document ? prisma.assetDocument.count({ where: { documentNumber: document.documentNumber } }) : 0,
    prisma.auditLog.count({
      where: {
        action: "ASSET_DOCUMENT_FROM_ENTRIES_CREATED",
        entityTable: "asset_documents",
        entityId: DOCUMENT_ID
      }
    }),
    prisma.assetFile.count()
  ]);
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
  const [invalid] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count FROM (
      SELECT 1 FROM "immos_recipe_phase8"."asset_document_entries" de
      LEFT JOIN "immos_recipe_phase8"."asset_documents" d ON d.id=de.document_id
      LEFT JOIN "immos_recipe_phase8"."asset_entries" e ON e.id=de.asset_entry_id
      WHERE d.id IS NULL OR e.id IS NULL
      UNION ALL
      SELECT 1 FROM "immos_recipe_phase8"."asset_document_lines" dl
      LEFT JOIN "immos_recipe_phase8"."asset_documents" d ON d.id=dl.document_id
      LEFT JOIN "immos_recipe_phase8"."asset_entries" e ON e.id=dl.asset_entry_id
      LEFT JOIN "immos_recipe_phase8"."asset_units" u ON u.id=dl.asset_unit_id
      LEFT JOIN "immos_recipe_phase8"."asset_items" i ON i.id=dl.asset_item_id
      LEFT JOIN "immos_recipe_phase8"."locations" l ON l.id=dl.location_id
      WHERE d.id IS NULL OR e.id IS NULL OR u.id IS NULL OR i.id IS NULL OR l.id IS NULL
    ) invalid`;
  const result = {
    document: document && {
      id: document.id,
      documentNumber: document.documentNumber,
      documentType: document.documentType,
      status: document.status,
      entryIds: document.entries.map((row) => row.assetEntryId),
      lineUnitIds: document.lines.map((row) => row.assetUnitId)
    },
    sameNumberCount,
    auditCount,
    totals,
    foreignKeyViolations: invalid.count,
    assetFiles
  };
  console.log(JSON.stringify(result, null, 2));
  if (!document || document.documentType !== "ENTRY_SLIP" ||
      document.entries.length !== 1 || document.entries[0].assetEntryId !== ENTRY_ID ||
      document.lines.length !== 1 || document.lines[0].assetUnitId !== UNIT_ID ||
      sameNumberCount !== 1 || auditCount !== 1 || totals.recipe_total !== 251 ||
      totals.reference_total !== 222 || invalid.count !== 0 || assetFiles !== 0) {
    throw new Error("Résultat ENTRY_SLIP non conforme.");
  }
} finally {
  await prisma.$disconnect();
}
