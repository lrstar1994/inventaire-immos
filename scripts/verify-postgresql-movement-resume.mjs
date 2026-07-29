import { PrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const MOVEMENT_ID = "cms5k4pgx0001v5ckzffmjdzh";
const UNIT_ID = "cms5jogls000rv5zw49j8a13s";
const ORIGINAL_LOCATION_ID = "cms5jnaj40009v5zwxz50blnq";
const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
url.searchParams.set("schema", "immos_recipe_phase8");
const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });

try {
  const [movement, unit, audits, assetFiles] = await Promise.all([
    prisma.assetMovement.findUnique({
      where: { id: MOVEMENT_ID },
      include: { lines: true }
    }),
    prisma.assetUnit.findUnique({ where: { id: UNIT_ID }, select: { id: true, locationId: true, status: true } }),
    prisma.auditLog.findMany({
      where: { entityId: MOVEMENT_ID },
      select: { id: true, action: true, entityTable: true, entityId: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    }),
    prisma.assetFile.count()
  ]);
  const [recipeTotal] = await prisma.$queryRaw`
    SELECT (
      (SELECT COUNT(*) FROM "immos_recipe_phase8"."users") +
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
      (SELECT COUNT(*) FROM "immos_recipe_phase8"."audit_logs")
    )::int AS total`;
  const result = {
    recipeTotal: recipeTotal.total,
    movement: movement && {
      id: movement.id,
      status: movement.movementStatus,
      validatedAt: movement.validatedAt,
      validatedById: movement.validatedById,
      lineCount: movement.lines.length,
      lines: movement.lines.map((line) => ({
        id: line.id,
        assetUnitId: line.assetUnitId,
        fromLocationId: line.fromLocationId,
        toLocationId: line.toLocationId
      }))
    },
    unit,
    unitUnchangedAfterValidationRollback: unit?.locationId === ORIGINAL_LOCATION_ID,
    audits,
    assetFiles
  };
  console.log(JSON.stringify(result, null, 2));
  if (!movement || movement.movementStatus !== "DRAFT" || movement.lines.length !== 1 ||
      unit?.locationId !== ORIGINAL_LOCATION_ID || audits.length !== 2 || assetFiles !== 0) {
    throw new Error("État de diagnostic du mouvement non conforme.");
  }
} finally {
  await prisma.$disconnect();
}
