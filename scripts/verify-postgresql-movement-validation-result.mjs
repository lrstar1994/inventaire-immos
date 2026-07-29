import { PrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const MOVEMENT_ID = "cms5k4pgx0001v5ckzffmjdzh";
const UNIT_ID = "cms5jogls000rv5zw49j8a13s";
const TARGET_LOCATION_ID = "cms5jn62k0005v5zw63q3jdhk";
const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
url.searchParams.set("schema", "immos_recipe_phase8");
const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });

try {
  const [movement, unit, audits, assetFiles] = await Promise.all([
    prisma.assetMovement.findUnique({ where: { id: MOVEMENT_ID }, include: { lines: true } }),
    prisma.assetUnit.findUnique({ where: { id: UNIT_ID }, select: { id: true, locationId: true, status: true } }),
    prisma.auditLog.findMany({
      where: {
        OR: [
          { action: "ASSET_MOVEMENT_VALIDATED", entityId: MOVEMENT_ID },
          { action: "ASSET_UNIT_LOCATION_UPDATED_BY_MOVEMENT", entityId: UNIT_ID }
        ]
      },
      select: { id: true, action: true, entityTable: true, entityId: true, metadata: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    }),
    prisma.assetFile.count()
  ]);
  const [invalid] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count FROM (
      SELECT 1 FROM "immos_recipe_phase8"."asset_movement_lines" l
      LEFT JOIN "immos_recipe_phase8"."asset_movements" m ON m.id=l.movement_id WHERE m.id IS NULL
      UNION ALL
      SELECT 1 FROM "immos_recipe_phase8"."asset_movement_lines" l
      LEFT JOIN "immos_recipe_phase8"."asset_units" u ON u.id=l.asset_unit_id WHERE u.id IS NULL
    ) invalid`;
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
  const result = {
    movement: {
      id: movement?.id,
      status: movement?.movementStatus,
      validatedAtPresent: Boolean(movement?.validatedAt),
      validatedByIdPresent: Boolean(movement?.validatedById),
      lineCount: movement?.lines.length
    },
    unit,
    targetLocationCorrect: unit?.locationId === TARGET_LOCATION_ID,
    audits,
    auditCount: audits.length,
    totals,
    foreignKeyViolations: invalid.count,
    assetFiles
  };
  console.log(JSON.stringify(result, null, 2));
  if (movement?.movementStatus !== "VALIDATED" || movement.lines.length !== 1 ||
      unit?.locationId !== TARGET_LOCATION_ID || audits.length !== 2 ||
      invalid.count !== 0 || assetFiles !== 0) {
    throw new Error("Validation du mouvement non conforme.");
  }
} finally {
  await prisma.$disconnect();
}
