import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const databasePath = path.resolve(projectRoot, process.argv[2] || "prisma/dev.db");
const uploadsRoot = path.resolve(projectRoot, process.argv[3] || "public/uploads/assets");
const outputRoot = path.resolve(projectRoot, process.argv[4] || "outputs/migration");
const expectedTables = [
  "users",
  "suppliers",
  "locations",
  "asset_categories",
  "asset_items",
  "asset_entries",
  "asset_units",
  "asset_files",
  "asset_movements",
  "asset_movement_lines",
  "asset_documents",
  "asset_document_entries",
  "asset_document_lines",
  "sensitive_action_approvals",
  "audit_logs"
];

const enumValues = {
  "users.role": ["DIRECTION", "INVENTORY_MANAGER", "MAINTENANCE_MANAGER", "BASIC_USER"],
  "users.status": ["ACTIVE", "DISABLED"],
  "suppliers.status": ["ACTIVE", "DISABLED"],
  "locations.status": ["ACTIVE", "DISABLED"],
  "asset_categories.status": ["ACTIVE", "DISABLED"],
  "asset_items.status": ["ACTIVE", "DISABLED"],
  "asset_entries.entry_type": ["PURCHASE", "EXISTING_STOCK", "DONATION", "INCOMING_TRANSFER", "PROGRESSIVE_INVENTORY"],
  "asset_entries.initial_condition": ["NEW", "VERY_GOOD", "GOOD", "FAIR", "WORN", "TO_REPAIR", "OUT_OF_ORDER"],
  "asset_entries.initial_status": ["IN_SERVICE", "IN_STOCK", "IN_REPAIR", "TEMPORARILY_OUT", "MISSING", "RETIRED"],
  "asset_entries.entry_status": ["DRAFT", "VALIDATED", "CANCELLED"],
  "asset_entries.information_status": ["COMPLETE", "PARTIAL", "TO_COMPLETE", "UNKNOWN_INFO"],
  "asset_units.condition": ["NEW", "VERY_GOOD", "GOOD", "FAIR", "WORN", "TO_REPAIR", "OUT_OF_ORDER"],
  "asset_units.status": ["IN_SERVICE", "IN_STOCK", "IN_REPAIR", "TEMPORARILY_OUT", "MISSING", "RETIRED"],
  "asset_units.information_status": ["COMPLETE", "PARTIAL", "TO_COMPLETE", "UNKNOWN_INFO"],
  "asset_files.file_type": ["MAIN_PHOTO", "GENERAL_VIEW", "DETAIL_VIEW", "DEFECT_PHOTO", "SERIAL_OR_LABEL", "INVOICE", "WARRANTY", "OTHER"],
  "asset_movements.movement_type": ["ASSIGNMENT", "REASSIGNMENT", "LOAN_EVENT", "RETURN_FROM_LOAN_EVENT", "WORKSHOP_REPAIR", "RETURN_FROM_WORKSHOP_REPAIR", "LOCATION_CHANGE", "ROOM_TRANSFER", "STOCK_TRANSFER", "TEMPORARY_EXIT", "RETURN_FROM_TEMPORARY_EXIT", "REGULARIZATION"],
  "asset_movements.movement_status": ["DRAFT", "VALIDATED", "CANCELLED"],
  "asset_documents.document_type": ["PROGRESSIVE_INVENTORY_SHEET", "ENTRY_SLIP", "ASSIGNMENT_SLIP", "MOVEMENT_SLIP", "BATCH_MOVEMENT_SLIP", "ISSUE_REPORT", "REPAIR_SHEET", "PERIODIC_INVENTORY_SHEET", "DISCREPANCY_SHEET", "REGULARIZATION_SLIP", "TEMPORARY_EXIT_SLIP", "RETURN_SLIP", "FINAL_EXIT_SLIP"],
  "asset_documents.status": ["DRAFT", "VALIDATED", "CANCELLED"]
};

const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
const db = new DatabaseSync(databasePath, { readOnly: true });
db.exec("PRAGMA query_only = ON");

function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

function scalar(sql, ...params) {
  const row = db.prepare(sql).get(...params);
  return row ? Object.values(row)[0] : null;
}

function addFinding(report, severity, category, message, details = []) {
  report.findings.push({ severity, category, message, details });
}

async function walkFiles(root) {
  const found = [];
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const absolute = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.name !== ".gitkeep") found.push(absolute);
    }
  }
  try {
    await walk(root);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return found;
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function detectedMime(buffer) {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buffer.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return "unknown";
}

const report = {
  generatedAt: new Date().toISOString(),
  databasePath,
  uploadsRoot,
  sqliteQueryOnly: scalar("PRAGMA query_only") === 1,
  integrityCheck: scalar("PRAGMA integrity_check"),
  tables: {},
  foreignKeys: {},
  dates: {},
  enums: {},
  files: { rows: 0, diskFiles: 0, totalBytes: 0, items: [] },
  findings: []
};

const actualTables = all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((row) => row.name);
for (const table of expectedTables) {
  if (!actualTables.includes(table)) {
    addFinding(report, "ERROR", "schema", `Table attendue absente : ${table}`);
    continue;
  }
  report.tables[table] = { rows: Number(scalar(`SELECT COUNT(*) FROM ${quote(table)}`)) };

  const columns = all(`PRAGMA table_info(${quote(table)})`);
  for (const column of columns.filter((item) => item.name.endsWith("_at") || item.name.endsWith("_date"))) {
    const invalid = all(
      `SELECT id, ${quote(column.name)} AS value FROM ${quote(table)}
       WHERE ${quote(column.name)} IS NOT NULL
       AND NOT (
         (typeof(${quote(column.name)}) IN ('integer', 'real')
           AND ${quote(column.name)} BETWEEN 946684800000 AND 4102444800000)
         OR
         (typeof(${quote(column.name)}) = 'text'
           AND julianday(${quote(column.name)}) IS NOT NULL)
       )`
    );
    report.dates[`${table}.${column.name}`] = { invalid: invalid.length, rows: invalid };
    if (invalid.length) addFinding(report, "ERROR", "dates", `${invalid.length} date(s) invalide(s) dans ${table}.${column.name}`, invalid);
  }

  for (const foreignKey of all(`PRAGMA foreign_key_list(${quote(table)})`)) {
    const key = `${table}.${foreignKey.from}->${foreignKey.table}.${foreignKey.to}`;
    const orphans = all(
      `SELECT child.id, child.${quote(foreignKey.from)} AS value
       FROM ${quote(table)} child
       LEFT JOIN ${quote(foreignKey.table)} parent
         ON parent.${quote(foreignKey.to)} = child.${quote(foreignKey.from)}
       WHERE child.${quote(foreignKey.from)} IS NOT NULL
         AND parent.${quote(foreignKey.to)} IS NULL`
    );
    report.foreignKeys[key] = { orphans: orphans.length, rows: orphans };
    if (orphans.length) addFinding(report, "ERROR", "foreign_keys", `${orphans.length} référence(s) orpheline(s) : ${key}`, orphans);
  }

  for (const index of all(`PRAGMA index_list(${quote(table)})`).filter((item) => item.unique === 1)) {
    const columnsInIndex = all(`PRAGMA index_info(${quote(index.name)})`).map((item) => item.name).filter(Boolean);
    if (!columnsInIndex.length) continue;
    const columnSql = columnsInIndex.map(quote).join(", ");
    const duplicates = all(
      `SELECT ${columnSql}, COUNT(*) AS occurrences FROM ${quote(table)}
       WHERE ${columnsInIndex.map((column) => `${quote(column)} IS NOT NULL`).join(" AND ")}
       GROUP BY ${columnSql} HAVING COUNT(*) > 1`
    );
    if (duplicates.length) addFinding(report, "ERROR", "duplicates", `Doublons pour l'index unique ${index.name}`, duplicates);
  }
}

for (const [key, allowed] of Object.entries(enumValues)) {
  const [table, column] = key.split(".");
  if (!actualTables.includes(table)) continue;
  const placeholders = allowed.map(() => "?").join(", ");
  const invalid = all(`SELECT id, ${quote(column)} AS value FROM ${quote(table)} WHERE ${quote(column)} NOT IN (${placeholders})`, ...allowed);
  report.enums[key] = { allowed, invalid: invalid.length, rows: invalid };
  if (invalid.length) addFinding(report, "ERROR", "enums", `${invalid.length} valeur(s) invalide(s) dans ${key}`, invalid);
}

const sqliteForeignKeyErrors = all("PRAGMA foreign_key_check");
if (sqliteForeignKeyErrors.length) addFinding(report, "ERROR", "foreign_keys", "PRAGMA foreign_key_check a détecté des erreurs", sqliteForeignKeyErrors);

const multiplePrimary = actualTables.includes("asset_files") ? all(
  `SELECT asset_unit_id, COUNT(*) AS occurrences
   FROM asset_files WHERE is_primary = 1 AND deleted_at IS NULL
   GROUP BY asset_unit_id HAVING COUNT(*) > 1`
) : [];
if (multiplePrimary.length) addFinding(report, "ERROR", "files", "Plusieurs photos principales actives pour un même bien", multiplePrimary);

const nonImagePrimary = actualTables.includes("asset_files") ? all(
  `SELECT id, asset_unit_id, mime_type FROM asset_files
   WHERE is_primary = 1 AND deleted_at IS NULL AND mime_type NOT LIKE 'image/%'`
) : [];
if (nonImagePrimary.length) addFinding(report, "ERROR", "files", "Photo principale active avec un MIME non image", nonImagePrimary);

for (const [table, predicate, message] of [
  ["asset_entries", "quantity <= 0", "Quantité d'entrée non positive"],
  ["asset_entries", "unit_price < 0 OR total_price < 0", "Montant d'entrée négatif"],
  ["asset_units", "unit_price < 0", "Prix de bien négatif"],
  ["asset_files", "file_size < 0", "Taille de fichier négative"],
  ["asset_document_lines", "quantity <= 0", "Quantité documentaire non positive"],
  ["asset_movement_lines", "from_location_id = to_location_id", "Mouvement sans changement d'emplacement"]
]) {
  if (!actualTables.includes(table)) continue;
  const rows = all(`SELECT * FROM ${quote(table)} WHERE ${predicate}`);
  if (rows.length) addFinding(report, "WARNING", "business_constraints", message, rows);
}

for (const [table, statusColumn] of [["asset_documents", "status"], ["asset_movements", "movement_status"]]) {
  if (!actualTables.includes(table)) continue;
  const invalidValidated = all(
    `SELECT id FROM ${quote(table)}
     WHERE ${quote(statusColumn)} = 'VALIDATED' AND (validated_at IS NULL OR validated_by IS NULL)`
  );
  const invalidCancelled = all(
    `SELECT id FROM ${quote(table)}
     WHERE ${quote(statusColumn)} = 'CANCELLED'
       AND (cancelled_at IS NULL OR cancelled_by IS NULL OR cancellation_reason IS NULL OR trim(cancellation_reason) = '')`
  );
  if (invalidValidated.length) addFinding(report, "WARNING", "workflow", `${table} validé(s) sans métadonnées complètes`, invalidValidated);
  if (invalidCancelled.length) addFinding(report, "WARNING", "workflow", `${table} annulé(s) sans métadonnées complètes`, invalidCancelled);
}

const emptyDocumentLines = actualTables.includes("asset_document_lines") ? all(
  `SELECT id FROM asset_document_lines
   WHERE asset_entry_id IS NULL AND asset_unit_id IS NULL AND asset_item_id IS NULL AND location_id IS NULL`
) : [];
if (emptyDocumentLines.length) addFinding(report, "WARNING", "documents", "Lignes documentaires sans entité liée", emptyDocumentLines);

const incompleteApprovals = actualTables.includes("sensitive_action_approvals") ? all(
  `SELECT id FROM sensitive_action_approvals
   WHERE trim(action) = '' OR trim(entity_table) = '' OR trim(entity_id) = '' OR trim(reason) = ''`
) : [];
if (incompleteApprovals.length) addFinding(report, "WARNING", "approvals", "Approbations sensibles incomplètes", incompleteApprovals);

const incompleteAuditLogs = actualTables.includes("audit_logs") ? all(
  `SELECT id FROM audit_logs WHERE trim(action) = '' OR trim(entity_table) = '' OR trim(entity_id) = ''`
) : [];
if (incompleteAuditLogs.length) addFinding(report, "WARNING", "audit_logs", "Journaux d'audit incomplets", incompleteAuditLogs);

const diskFiles = await walkFiles(uploadsRoot);
const referencedPaths = new Map();
const fileRows = actualTables.includes("asset_files") ? all("SELECT * FROM asset_files ORDER BY id") : [];
report.files.rows = fileRows.length;
for (const row of fileRows) {
  const relative = String(row.file_path || "").replace(/^[/\\]+/, "").replace(/^uploads[/\\]assets[/\\]/, "");
  const absolute = path.join(uploadsRoot, relative);
  referencedPaths.set(path.normalize(absolute).toLowerCase(), row);
  const item = { id: row.id, filePath: row.file_path, expectedSize: row.file_size, deletedAt: row.deleted_at };
  try {
    const info = await stat(absolute);
    const bytes = await readFile(absolute);
    Object.assign(item, {
      exists: true,
      actualSize: info.size,
      sha256: await sha256(absolute),
      declaredMime: row.mime_type,
      detectedMime: detectedMime(bytes.subarray(0, 16))
    });
    if (info.size !== row.file_size) addFinding(report, "ERROR", "files", `Taille différente pour asset_files ${row.id}`, [item]);
    if (item.detectedMime !== "unknown" && item.detectedMime !== row.mime_type) addFinding(report, "ERROR", "files", `MIME différent pour asset_files ${row.id}`, [item]);
  } catch (error) {
    item.exists = false;
    item.error = error.code || error.message;
    addFinding(report, row.deleted_at ? "WARNING" : "ERROR", "files", `Fichier local manquant pour asset_files ${row.id}`, [item]);
  }
  report.files.items.push(item);
}

for (const filePath of diskFiles) {
  const info = await stat(filePath);
  report.files.diskFiles += 1;
  report.files.totalBytes += info.size;
  if (!referencedPaths.has(path.normalize(filePath).toLowerCase())) {
    addFinding(report, "WARNING", "files", "Fichier local sans ligne asset_files", [{
      filePath: path.relative(projectRoot, filePath).replaceAll("\\", "/"),
      size: info.size,
      sha256: await sha256(filePath)
    }]);
  }
}

report.summary = {
  expectedTables: expectedTables.length,
  actualExpectedTables: expectedTables.filter((table) => actualTables.includes(table)).length,
  errors: report.findings.filter((item) => item.severity === "ERROR").length,
  warnings: report.findings.filter((item) => item.severity === "WARNING").length
};

await mkdir(outputRoot, { recursive: true });
const jsonPath = path.join(outputRoot, "sqlite-audit-report.json");
const markdownPath = path.join(outputRoot, "sqlite-audit-report.md");
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const markdown = [
  "# Rapport d'audit SQLite avant migration",
  "",
  `- Généré : ${report.generatedAt}`,
  `- Base : \`${databasePath}\``,
  `- SQLite ouvert en lecture seule : ${report.sqliteQueryOnly ? "oui" : "non"}`,
  `- Intégrité SQLite : \`${report.integrityCheck}\``,
  `- Tables attendues trouvées : ${report.summary.actualExpectedTables}/${report.summary.expectedTables}`,
  `- Erreurs : ${report.summary.errors}`,
  `- Avertissements : ${report.summary.warnings}`,
  "",
  "## Lignes par table",
  "",
  "| Table | Lignes |",
  "|---|---:|",
  ...expectedTables.map((table) => `| ${table} | ${report.tables[table]?.rows ?? "absente"} |`),
  "",
  "## Fichiers",
  "",
  `- Lignes asset_files : ${report.files.rows}`,
  `- Fichiers physiques hors .gitkeep : ${report.files.diskFiles}`,
  `- Taille physique totale : ${report.files.totalBytes} octets`,
  "",
  "## Anomalies",
  "",
  ...(report.findings.length
    ? report.findings.map((item, index) => `${index + 1}. **${item.severity} — ${item.category}** : ${item.message} (${item.details.length} élément(s))`)
    : ["Aucune anomalie détectée par les contrôles définis."]),
  "",
  "Le détail complet, y compris les identifiants concernés, se trouve dans `sqlite-audit-report.json`.",
  ""
].join("\n");
await writeFile(markdownPath, markdown, "utf8");
db.close();

console.log(JSON.stringify({ jsonPath, markdownPath, summary: report.summary }, null, 2));
