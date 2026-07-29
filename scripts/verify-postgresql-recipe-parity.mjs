import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const RECIPE_SCHEMA = "immos_recipe_phase8";
const REFERENCE_SCHEMA = "immos";
const exportRoot = path.resolve(process.cwd(), "outputs/migration/sqlite-export/run-1");
const manifest = JSON.parse(await readFile(path.join(exportRoot, "manifest.json"), "utf8"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const normalize = (rows, sourceRows, columns) => rows.map((row, index) => Object.fromEntries(
  columns.map((column) => {
    const sourceValue = sourceRows[index]?.[column];
    const value = sourceValue !== null && typeof sourceValue === "string" &&
      /^\d{4}-\d{2}-\d{2}T/.test(sourceValue)
      ? new Date(row[column]).toISOString()
      : row[column];
    return [column, value];
  })
));

const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
url.searchParams.set("schema", RECIPE_SCHEMA);
if (url.port !== "5432" || url.searchParams.get("sslmode") !== "require") {
  throw new Error("Vérification refusée : connexion session 5432 obligatoire.");
}
const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });

try {
  const comparisons = [];
  let recipeTotal = 0;
  let referenceTotal = 0;
  for (const table of manifest.tables) {
    const sourceRows = JSON.parse(await readFile(path.join(exportRoot, table.file), "utf8"));
    const selection = table.columns.map(quote).join(",");
    const order = quote(table.primaryKey);
    const recipeRows = await prisma.$queryRawUnsafe(
      `SELECT ${selection} FROM ${quote(RECIPE_SCHEMA)}.${quote(table.table)} ORDER BY ${order}`
    );
    const referenceRows = await prisma.$queryRawUnsafe(
      `SELECT ${selection} FROM ${quote(REFERENCE_SCHEMA)}.${quote(table.table)} ORDER BY ${order}`
    );
    const normalizedRecipe = normalize(recipeRows, sourceRows, table.columns);
    const normalizedReference = normalize(referenceRows, sourceRows, table.columns);
    const recipeSha256 = hash(Buffer.from(serialize(normalizedRecipe), "utf8"));
    const referenceSha256 = hash(Buffer.from(serialize(normalizedReference), "utf8"));
    const sourceSha256 = hash(Buffer.from(serialize(sourceRows), "utf8"));
    const recipeIds = normalizedRecipe.map((row) => row[table.primaryKey]);
    const referenceIds = normalizedReference.map((row) => row[table.primaryKey]);
    comparisons.push({
      table: table.table,
      recipeRows: recipeRows.length,
      referenceRows: referenceRows.length,
      sourceSha256,
      recipeSha256,
      referenceSha256,
      identifiersEqual: JSON.stringify(recipeIds) === JSON.stringify(referenceIds),
      equal: sourceSha256 === recipeSha256 && recipeSha256 === referenceSha256
    });
    recipeTotal += recipeRows.length;
    referenceTotal += referenceRows.length;
  }
  const [invalid] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM (
       SELECT 1 FROM "${RECIPE_SCHEMA}"."asset_items" c LEFT JOIN "${RECIPE_SCHEMA}"."asset_categories" p ON p.id=c.category_id WHERE p.id IS NULL
       UNION ALL SELECT 1 FROM "${RECIPE_SCHEMA}"."asset_entries" c LEFT JOIN "${RECIPE_SCHEMA}"."asset_items" p ON p.id=c.asset_item_id WHERE p.id IS NULL
       UNION ALL SELECT 1 FROM "${RECIPE_SCHEMA}"."asset_units" c LEFT JOIN "${RECIPE_SCHEMA}"."asset_items" p ON p.id=c.asset_item_id WHERE p.id IS NULL
       UNION ALL SELECT 1 FROM "${RECIPE_SCHEMA}"."asset_movement_lines" c LEFT JOIN "${RECIPE_SCHEMA}"."asset_movements" p ON p.id=c.movement_id WHERE p.id IS NULL
       UNION ALL SELECT 1 FROM "${RECIPE_SCHEMA}"."asset_document_entries" c LEFT JOIN "${RECIPE_SCHEMA}"."asset_documents" p ON p.id=c.document_id WHERE p.id IS NULL
       UNION ALL SELECT 1 FROM "${RECIPE_SCHEMA}"."asset_document_lines" c LEFT JOIN "${RECIPE_SCHEMA}"."asset_documents" p ON p.id=c.document_id WHERE p.id IS NULL
     ) invalid`
  );
  const report = {
    checkedAt: new Date().toISOString(),
    connection: { port: 5432, schema: RECIPE_SCHEMA, sslmode: "require" },
    recipeTotal,
    referenceTotal,
    assetFilesRows: comparisons.find((item) => item.table === "asset_files")?.recipeRows,
    foreignKeyViolations: invalid.count,
    comparisons,
    allEqual: comparisons.every((item) => item.equal && item.identifiersEqual)
  };
  await mkdir(path.resolve("outputs/migration/supabase-phase-8"), { recursive: true });
  await writeFile(
    path.resolve("outputs/migration/supabase-phase-8/recipe-parity.json"),
    serialize(report),
    "utf8"
  );
  if (recipeTotal !== 222 || referenceTotal !== 222 || report.assetFilesRows !== 0 ||
      report.foreignKeyViolations !== 0 || !report.allEqual) {
    throw new Error("La parité du schéma de recette a échoué.");
  }
  console.log(JSON.stringify({
    result: "RECIPE_PARITY_OK",
    tables: comparisons.length,
    recipeTotal,
    referenceTotal,
    foreignKeyViolations: report.foreignKeyViolations,
    assetFilesRows: report.assetFilesRows
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
