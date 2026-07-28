import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.resolve(root, process.argv[2] || "prisma/dev.db");
const repairedPath = path.resolve(root, process.argv[3] || "prisma/dev-repair-test.db");
const outputRoot = path.resolve(root, process.argv[4] || "outputs/migration/sqlite-repair");
const expectedTables = [
  "users", "suppliers", "locations", "asset_categories", "asset_items",
  "asset_entries", "asset_units", "asset_files", "asset_movements",
  "asset_movement_lines", "asset_documents", "asset_document_entries",
  "asset_document_lines", "sensitive_action_approvals", "audit_logs"
];
const expectedAssetFileIndexes = [
  "asset_files_asset_unit_id_idx",
  "asset_files_file_type_idx",
  "asset_files_is_primary_idx",
  "asset_files_deleted_at_idx"
];

const hash = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const openReadOnly = (file) => {
  const db = new DatabaseSync(file, { readOnly: true });
  db.exec("PRAGMA query_only = ON");
  return db;
};

const source = openReadOnly(sourcePath);
const repaired = openReadOnly(repairedPath);
const tableNames = (db) => db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' ORDER BY name"
).all().map((row) => row.name);
const sourceTables = tableNames(source);
const repairedTables = tableNames(repaired);
const commonTables = sourceTables.filter((table) => repairedTables.includes(table));
const rowCounts = commonTables.map((table) => {
  const escaped = table.replaceAll('"', '""');
  const sourceRows = Number(source.prepare(`SELECT COUNT(*) AS count FROM "${escaped}"`).get().count);
  const repairedRows = Number(repaired.prepare(`SELECT COUNT(*) AS count FROM "${escaped}"`).get().count);
  return { table, sourceRows, repairedRows, match: sourceRows === repairedRows };
});

const assetFilesSql = repaired.prepare(
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='asset_files'"
).get()?.sql || null;
const assetFileColumns = repaired.prepare("PRAGMA table_info('asset_files')").all();
const assetFileForeignKeys = repaired.prepare("PRAGMA foreign_key_list('asset_files')").all();
const assetFileIndexes = repaired.prepare(
  "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='asset_files' ORDER BY name"
).all();
const migrations = repaired.prepare(
  `SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
   FROM "_prisma_migrations" ORDER BY started_at, migration_name`
).all();
const report = {
  generatedAt: new Date().toISOString(),
  sourcePath,
  repairedPath,
  sourceSha256: await hash(sourcePath),
  repairedSha256: await hash(repairedPath),
  sourceIntegrity: source.prepare("PRAGMA integrity_check").get().integrity_check,
  repairedIntegrity: repaired.prepare("PRAGMA integrity_check").get().integrity_check,
  repairedForeignKeyCheck: repaired.prepare("PRAGMA foreign_key_check").all(),
  expectedTables: expectedTables.length,
  sourceTables: sourceTables.length,
  repairedTables: repairedTables.length,
  missingExpectedTables: expectedTables.filter((table) => !repairedTables.includes(table)),
  rowCounts,
  allExistingRowCountsMatch: rowCounts.every((item) => item.match),
  assetFiles: {
    sql: assetFilesSql,
    columns: assetFileColumns,
    foreignKeys: assetFileForeignKeys,
    indexes: assetFileIndexes,
    missingIndexes: expectedAssetFileIndexes.filter((name) => !assetFileIndexes.some((index) => index.name === name)),
    rows: Number(repaired.prepare("SELECT COUNT(*) AS count FROM asset_files").get().count)
  },
  migrations
};
source.close();
repaired.close();

await mkdir(outputRoot, { recursive: true });
const jsonPath = path.join(outputRoot, "repair-test-verification.json");
const markdownPath = path.join(outputRoot, "repair-test-verification.md");
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(markdownPath, [
  "# Vérification de la réparation SQLite sur copie",
  "",
  `- Source : \`${sourcePath}\``,
  `- Copie réparée : \`${repairedPath}\``,
  `- Intégrité source : \`${report.sourceIntegrity}\``,
  `- Intégrité copie : \`${report.repairedIntegrity}\``,
  `- Tables source : ${report.sourceTables}/15`,
  `- Tables copie : ${report.repairedTables}/15`,
  `- Comptages des 14 tables historiques identiques : ${report.allExistingRowCountsMatch ? "oui" : "non"}`,
  `- Erreurs de clés étrangères : ${report.repairedForeignKeyCheck.length}`,
  `- Lignes asset_files : ${report.assetFiles.rows}`,
  `- Index asset_files manquants : ${report.assetFiles.missingIndexes.join(", ") || "aucun"}`,
  "",
  "## Comptages",
  "",
  "| Table | Source | Copie | Identique |",
  "|---|---:|---:|---|",
  ...rowCounts.map((item) => `| ${item.table} | ${item.sourceRows} | ${item.repairedRows} | ${item.match ? "oui" : "non"} |`),
  "",
  "Le détail des colonnes, index, clé étrangère et migrations est disponible dans le rapport JSON.",
  ""
].join("\n"), "utf8");
console.log(JSON.stringify({ jsonPath, markdownPath, summary: {
  repairedTables: report.repairedTables,
  allExistingRowCountsMatch: report.allExistingRowCountsMatch,
  foreignKeyErrors: report.repairedForeignKeyCheck.length,
  missingAssetFileIndexes: report.assetFiles.missingIndexes
}}, null, 2));
