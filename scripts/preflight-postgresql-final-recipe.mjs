import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient as RecipeClient } from "../generated/prisma-recipe/index.js";
import { PrismaClient as NormalClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const DOCUMENT_ID = "cms5p313k0000v5qo7b1vv0y2";
const manifest = JSON.parse(await readFile(path.resolve("outputs/migration/sqlite-export/run-1/manifest.json"), "utf8"));
const env = await loadSupabaseEnv();
const base = new URL(env.SUPABASE_DIRECT_URL);
const recipeUrl = new URL(base);
recipeUrl.searchParams.set("schema", "immos_recipe_phase8");
const normalUrl = new URL(base);
normalUrl.searchParams.set("schema", "immos");
const recipe = new RecipeClient({ datasourceUrl: recipeUrl.toString(), errorFormat: "minimal" });
const normal = new NormalClient({ datasourceUrl: normalUrl.toString(), errorFormat: "minimal" });
const quote = (value) => `"${value.replaceAll('"', '""')}"`;

try {
  const startedAt = performance.now();
  const [one] = await recipe.$queryRaw`SELECT 1::int AS value, current_schema() AS schema`;
  const hashes = {};
  let referenceTotal = 0;
  for (const table of manifest.tables) {
    const rows = await normal.$queryRawUnsafe(
      `SELECT ${table.columns.map(quote).join(",")} FROM "immos".${quote(table.table)} ORDER BY ${quote(table.primaryKey)}`
    );
    referenceTotal += rows.length;
    hashes[table.table] = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  }
  const aggregateFingerprint = createHash("sha256").update(JSON.stringify(hashes)).digest("hex");
  const [document, recipeTotal, auditCount, assetFiles] = await Promise.all([
    recipe.assetDocument.findUnique({ where: { id: DOCUMENT_ID }, include: { entries: true, lines: true } }),
    recipe.$queryRawUnsafe(`SELECT (${manifest.tables.map((table) =>
      `(SELECT COUNT(*) FROM "immos_recipe_phase8".${quote(table.table)})`
    ).join(" + ")})::int AS total`),
    recipe.auditLog.count({ where: { action: "ASSET_DOCUMENT_FROM_ENTRIES_CREATED", entityId: DOCUMENT_ID } }),
    recipe.assetFile.count()
  ]);
  const [invalid] = await recipe.$queryRawUnsafe(`
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
    ) invalid`);
  const result = {
    result: "FINAL_RECIPE_PREFLIGHT_OK",
    durationMs: Math.round(performance.now() - startedAt),
    selectOne: one.value,
    currentSchema: one.schema,
    recipeTotal: recipeTotal[0].total,
    referenceTotal,
    referenceFingerprint: aggregateFingerprint,
    document: document && {
      id: document.id,
      number: document.documentNumber,
      entryCount: document.entries.length,
      lineCount: document.lines.length
    },
    documentAuditCount: auditCount,
    foreignKeyViolations: invalid.count,
    assetFiles
  };
  console.log(JSON.stringify(result, null, 2));
  if (one.schema !== "immos_recipe_phase8" || recipeTotal[0].total !== 251 ||
      referenceTotal !== 222 || aggregateFingerprint !== "92d21219717d44445ad6a9eb1ecfeab333b808dc5cc094cd85d4e267913d290a" ||
      document?.documentNumber !== "BE-2026-000011" || document.entries.length !== 1 ||
      document.lines.length !== 1 || auditCount !== 1 || invalid.count !== 0 || assetFiles !== 0) {
    throw new Error("Prévol final non conforme.");
  }
} finally {
  await Promise.allSettled([recipe.$disconnect(), normal.$disconnect()]);
}
