import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { chmod, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const expectedTables = [
  "users", "suppliers", "locations", "asset_categories", "asset_items",
  "asset_entries", "asset_units", "asset_files", "asset_movements",
  "asset_movement_lines", "asset_documents", "asset_document_entries",
  "asset_document_lines", "sensitive_action_approvals", "audit_logs"
];
const booleanColumns = new Set([
  "asset_entries.purchase_date_known", "asset_entries.supplier_known",
  "asset_entries.price_known", "asset_entries.invoice_available",
  "asset_units.purchase_date_known", "asset_units.price_known",
  "asset_units.supplier_known", "asset_units.invoice_available",
  "asset_units.possible_duplicate", "asset_files.is_primary"
]);
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
const sensitiveColumns = {
  users: ["direction_code_hash", "external_auth_id"],
  sensitive_action_approvals: ["metadata"],
  audit_logs: ["metadata"]
};
const expectedOrphans = {
  "LIT-KING-000002/LIT-KING-000002-8294b002-602f-4e5f-9d47-66fbb469e0ec-133828107271725621.jpg":
    "4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a",
  "LIT-KING-000002/LIT-KING-000002-833c4964-8f75-4b4a-a13e-cdb6ab9aaca2-133879581908740101.jpg":
    "ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83",
  "LIT-KING-000002/LIT-KING-000002-f1b9b68c-989d-405e-9802-1c246e352791-133810434509723163.jpg":
    "d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec"
};

function argument(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}
const databasePath = path.resolve(root, argument("database", "prisma/dev.db"));
const outputBase = path.resolve(root, argument("output", "outputs/migration/sqlite-export"));
const expectedSha256 = argument("expected-sha256");
const label = argument("label");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputRoot = path.join(outputBase, label || timestamp);
const tablesRoot = path.join(outputRoot, "tables");
const uploadsRoot = path.resolve(root, "public/uploads/assets");

const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashFile = async (file) => hashBytes(await readFile(file));
const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
const databaseHeader = (await readFile(databasePath)).subarray(0, 16).toString("binary");
if (databaseHeader !== "SQLite format 3\u0000") throw new Error("Export refusé : le fichier détecté n'est pas une base SQLite.");
const databaseSha256Before = await hashFile(databasePath);
if (expectedSha256 && databaseSha256Before !== expectedSha256.toLowerCase()) {
  throw new Error("Export refusé : l'empreinte SQLite ne correspond pas à l'état validé.");
}

const db = new DatabaseSync(databasePath, { readOnly: true });
db.exec("PRAGMA query_only = ON");
const all = (sql, ...params) => db.prepare(sql).all(...params);
const scalar = (sql, ...params) => Object.values(db.prepare(sql).get(...params))[0];
const databaseList = all("PRAGMA database_list");
if (databaseList.length !== 1 || path.resolve(databaseList[0].file) !== databasePath) {
  throw new Error("Export refusé : la base SQLite ouverte n'est pas le fichier attendu.");
}
const integrityCheck = scalar("PRAGMA integrity_check");
const foreignKeyErrors = all("PRAGMA foreign_key_check");
if (integrityCheck !== "ok" || foreignKeyErrors.length) throw new Error("Export refusé : intégrité SQLite invalide.");
const actualTables = all(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' ORDER BY name"
).map((item) => item.name);
const missingTables = expectedTables.filter((table) => !actualTables.includes(table));
const unexpectedTables = actualTables.filter((table) => !expectedTables.includes(table));
if (missingTables.length || unexpectedTables.length) {
  throw new Error(`Export refusé : structure différente (absentes=${missingTables.length}, inattendues=${unexpectedTables.length}).`);
}

await mkdir(tablesRoot, { recursive: true, mode: 0o700 });
await chmod(outputRoot, 0o700).catch(() => {});
const temporal = { formats: {}, columns: {}, ambiguousValues: [] };
const invalidEnums = [];
const manifestTables = [];
const counts = {};
const checksums = [];
const relational = { pragmaForeignKeyErrors: foreignKeyErrors, dependencies: {}, optionalNullCounts: {}, semanticChecks: [] };
const numericValidation = { integerColumns: {}, nonIntegerValues: [] };

function convertTemporal(table, column, id, value) {
  if (value === null) return null;
  const key = `${table}.${column}`;
  temporal.columns[key] ||= { values: 0, nulls: 0, formats: {} };
  temporal.columns[key].values += 1;
  let format;
  let converted = value;
  if (typeof value === "number" && Number.isInteger(value)) {
    format = "unix_epoch_milliseconds";
    converted = new Date(value).toISOString();
  } else if (typeof value === "string" && /(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    format = "iso8601_with_explicit_offset";
    converted = new Date(value).toISOString();
  } else {
    format = "text_without_explicit_offset";
    temporal.ambiguousValues.push({ table, column, id, originalType: typeof value });
  }
  temporal.formats[format] = (temporal.formats[format] || 0) + 1;
  temporal.columns[key].formats[format] = (temporal.columns[key].formats[format] || 0) + 1;
  return converted;
}

for (const table of expectedTables) {
  const columns = all(`PRAGMA table_info(${quote(table)})`);
  const columnNames = columns.map((column) => column.name);
  const primaryKey = columns.find((column) => column.pk === 1)?.name;
  if (!primaryKey) throw new Error(`Clé primaire introuvable pour ${table}.`);
  const foreignKeys = all(`PRAGMA foreign_key_list(${quote(table)})`);
  const dependencies = [...new Set(foreignKeys.map((fk) => fk.table))].sort();
  relational.dependencies[table] = foreignKeys.map((fk) => ({
    column: fk.from, referencesTable: fk.table, referencesColumn: fk.to,
    onDelete: fk.on_delete, onUpdate: fk.on_update
  }));
  for (const fk of foreignKeys) {
    const key = `${table}.${fk.from}`;
    relational.optionalNullCounts[key] = Number(scalar(
      `SELECT COUNT(*) FROM ${quote(table)} WHERE ${quote(fk.from)} IS NULL`
    ));
  }
  const temporalColumns = columns
    .filter((column) => /(_at|_date)$/.test(column.name) || /DATE|TIME/i.test(column.type))
    .map((column) => column.name);
  for (const column of temporalColumns) {
    const key = `${table}.${column}`;
    temporal.columns[key] ||= { values: 0, nulls: 0, formats: {} };
    temporal.columns[key].nulls = Number(scalar(
      `SELECT COUNT(*) FROM ${quote(table)} WHERE ${quote(column)} IS NULL`
    ));
  }
  const rows = all(`SELECT * FROM ${quote(table)} ORDER BY ${quote(primaryKey)} ASC`);
  const exportedRows = rows.map((row) => {
    const exported = {};
    for (const column of columnNames) {
      let value = row[column];
      const columnDefinition = columns.find((item) => item.name === column);
      if (value !== null && /INT/i.test(columnDefinition.type)) {
        const key = `${table}.${column}`;
        numericValidation.integerColumns[key] = (numericValidation.integerColumns[key] || 0) + 1;
        if (typeof value !== "number" || !Number.isInteger(value)) {
          numericValidation.nonIntegerValues.push({ table, column, id: row[primaryKey] });
        }
      }
      if (temporalColumns.includes(column)) value = convertTemporal(table, column, row[primaryKey], value);
      if (booleanColumns.has(`${table}.${column}`) && value !== null) {
        if (value !== 0 && value !== 1) throw new Error(`Booléen SQLite invalide : ${table}.${column}.`);
        value = value === 1;
      }
      const allowed = enumValues[`${table}.${column}`];
      if (allowed && value !== null && !allowed.includes(value)) {
        invalidEnums.push({ table, column, id: row[primaryKey], value });
      }
      exported[column] = value;
    }
    return exported;
  });
  const json = `${JSON.stringify(exportedRows, null, 2)}\n`;
  const fileName = `${table}.json`;
  const filePath = path.join(tablesRoot, fileName);
  await writeFile(filePath, json, { encoding: "utf8", mode: 0o600 });
  const bytes = Buffer.from(json, "utf8");
  const sha256 = hashBytes(bytes);
  counts[table] = exportedRows.length;
  checksums.push({ sha256, path: `tables/${fileName}` });
  manifestTables.push({
    table,
    rows: exportedRows.length,
    primaryKey,
    file: `tables/${fileName}`,
    bytes: bytes.length,
    sha256,
    columns: columnNames,
    sensitiveColumnsPresent: (sensitiveColumns[table] || []).filter((column) => columnNames.includes(column)),
    dependencies
  });
}

for (const check of [
  ["asset_units_without_item", `SELECT COUNT(*) FROM asset_units u LEFT JOIN asset_items i ON i.id=u.asset_item_id WHERE i.id IS NULL`],
  ["movements_without_unit", `SELECT COUNT(*) FROM asset_movement_lines l LEFT JOIN asset_units u ON u.id=l.asset_unit_id WHERE u.id IS NULL`],
  ["document_entries_without_entry", `SELECT COUNT(*) FROM asset_document_entries l LEFT JOIN asset_entries e ON e.id=l.asset_entry_id WHERE e.id IS NULL`],
  ["document_lines_invalid_entry", `SELECT COUNT(*) FROM asset_document_lines l LEFT JOIN asset_entries e ON e.id=l.asset_entry_id WHERE l.asset_entry_id IS NOT NULL AND e.id IS NULL`],
  ["document_lines_invalid_unit", `SELECT COUNT(*) FROM asset_document_lines l LEFT JOIN asset_units u ON u.id=l.asset_unit_id WHERE l.asset_unit_id IS NOT NULL AND u.id IS NULL`],
  ["related_movements_invalid", `SELECT COUNT(*) FROM asset_movements m LEFT JOIN asset_movements r ON r.id=m.related_movement_id WHERE m.related_movement_id IS NOT NULL AND r.id IS NULL`]
]) {
  relational.semanticChecks.push({ name: check[0], errors: Number(scalar(check[1])) });
}
const auditReferences = [];
for (const row of all("SELECT id, entity_table, entity_id FROM audit_logs ORDER BY id")) {
  if (!expectedTables.includes(row.entity_table)) {
    auditReferences.push({ auditId: row.id, entityTable: row.entity_table, status: "non_table_business_reference" });
    continue;
  }
  const exists = Number(scalar(
    `SELECT COUNT(*) FROM ${quote(row.entity_table)} WHERE id = ?`, row.entity_id
  )) > 0;
  if (!exists) auditReferences.push({ auditId: row.id, entityTable: row.entity_table, status: "missing_entity" });
}
relational.auditReferenceExceptions = auditReferences;

function computeImportPlan() {
  const selfRelations = [];
  const dependencies = Object.fromEntries(expectedTables.map((table) => [table, new Set()]));
  for (const table of expectedTables) {
    for (const fk of relational.dependencies[table]) {
      if (fk.referencesTable === table) {
        selfRelations.push({ table, column: fk.column, secondPassRecommended: true });
      } else {
        dependencies[table].add(fk.referencesTable);
      }
    }
  }
  if (!selfRelations.some((item) => item.table === "asset_movements" && item.column === "related_movement_id")) {
    selfRelations.push({
      table: "asset_movements",
      column: "related_movement_id",
      secondPassRecommended: true,
      source: "Prisma relation; SQLite migration has no physical FK constraint"
    });
  }
  const remaining = new Set(expectedTables);
  const inserted = new Set();
  const order = [];
  while (remaining.size) {
    const ready = [...remaining].filter((table) => [...dependencies[table]].every((dependency) => inserted.has(dependency))).sort();
    if (!ready.length) break;
    for (const table of ready) {
      order.push(table);
      inserted.add(table);
      remaining.delete(table);
    }
  }
  return {
    roots: expectedTables.filter((table) => dependencies[table].size === 0).sort(),
    insertionOrder: order,
    unresolvedCycles: [...remaining].sort(),
    selfRelations,
    rollbackCleanupOrder: [...order].reverse()
  };
}
const importPlan = computeImportPlan();

async function listPhysicalFiles(folder, base = folder) {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const absolute = path.join(folder, entry.name);
    if (entry.isDirectory()) result.push(...await listPhysicalFiles(absolute, base));
    else if (entry.name !== ".gitkeep") result.push({
      path: path.relative(base, absolute).replaceAll("\\", "/"),
      bytes: (await stat(absolute)).size,
      sha256: await hashFile(absolute)
    });
  }
  return result;
}
const physicalFiles = await listPhysicalFiles(uploadsRoot);
const orphanFiles = physicalFiles.map((file) => ({
  ...file,
  expectedSha256: expectedOrphans[file.path] || null,
  hashUnchanged: expectedOrphans[file.path] === file.sha256,
  excludedFromBusinessExport: true
}));
if (orphanFiles.length !== 3 || orphanFiles.some((file) => !file.hashUnchanged)) {
  throw new Error("Export refusé : les fichiers orphelins ne correspondent pas à l'état validé.");
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const schemaBytes = await readFile(path.join(root, "prisma", "schema.prisma"));
const migrations = (await readdir(path.join(root, "prisma", "migrations"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const manifest = {
  format: "inventaire-immos-sqlite-json-v1",
  exportedAt: new Date().toISOString(),
  database: {
    path: path.relative(root, databasePath).replaceAll("\\", "/"),
    sha256: databaseSha256Before,
    integrityCheck,
    foreignKeyErrors: foreignKeyErrors.length
  },
  environment: {
    node: process.version,
    prisma: packageJson.dependencies?.prisma || packageJson.devDependencies?.prisma || null,
    prismaClient: packageJson.dependencies?.["@prisma/client"] || null,
    gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    prismaSchemaSha256: hashBytes(schemaBytes),
    latestSqliteMigration: migrations.at(-1),
    sqliteMigrationCount: migrations.length
  },
  tables: manifestTables,
  invalidEnums,
  temporalSummary: {
    formats: temporal.formats,
    ambiguousValues: temporal.ambiguousValues.length
  },
  numericValidation,
  orphanFilesExcluded: orphanFiles.map((file) => ({
    path: file.path, bytes: file.bytes, sha256: file.sha256, hashUnchanged: file.hashUnchanged
  })),
  importPlan
};

const countsJson = `${JSON.stringify(counts, null, 2)}\n`;
await writeFile(path.join(outputRoot, "counts.json"), countsJson, { encoding: "utf8", mode: 0o600 });
checksums.push({ sha256: hashBytes(Buffer.from(countsJson)), path: "counts.json" });
const temporalJson = `${JSON.stringify(temporal, null, 2)}\n`;
await writeFile(path.join(outputRoot, "temporal-report.json"), temporalJson, { encoding: "utf8", mode: 0o600 });
checksums.push({ sha256: hashBytes(Buffer.from(temporalJson)), path: "temporal-report.json" });
const relationalJson = `${JSON.stringify(relational, null, 2)}\n`;
await writeFile(path.join(outputRoot, "relational-integrity.json"), relationalJson, { encoding: "utf8", mode: 0o600 });
checksums.push({ sha256: hashBytes(Buffer.from(relationalJson)), path: "relational-integrity.json" });
const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(path.join(outputRoot, "manifest.json"), manifestJson, { encoding: "utf8", mode: 0o600 });
checksums.push({ sha256: hashBytes(Buffer.from(manifestJson)), path: "manifest.json" });
const checksumText = `${checksums.sort((a, b) => a.path.localeCompare(b.path)).map((item) => `${item.sha256}  ${item.path}`).join("\n")}\n`;
await writeFile(path.join(outputRoot, "SHA256SUMS.txt"), checksumText, { encoding: "utf8", mode: 0o600 });

const totalTableBytes = manifestTables.reduce((sum, table) => sum + table.bytes, 0);
const report = [
  "# Export contrôlé SQLite",
  "",
  `- Export : ${manifest.exportedAt}`,
  `- Base : \`${manifest.database.path}\``,
  `- SHA-256 SQLite : \`${manifest.database.sha256}\``,
  `- Intégrité : \`${integrityCheck}\``,
  `- Erreurs de clés étrangères : ${foreignKeyErrors.length}`,
  `- Tables : ${manifestTables.length}`,
  `- Lignes totales : ${Object.values(counts).reduce((sum, count) => sum + count, 0)}`,
  `- Taille JSON des tables : ${totalTableBytes} octets`,
  `- Enums incompatibles : ${invalidEnums.length}`,
  `- Valeurs temporelles ambiguës : ${temporal.ambiguousValues.length}`,
  `- Valeurs non entières dans les colonnes INTEGER : ${numericValidation.nonIntegerValues.length}`,
  "",
  "## Comptages",
  "",
  "| Table | Lignes | SHA-256 |",
  "|---|---:|---|",
  ...manifestTables.map((table) => `| ${table.table} | ${table.rows} | \`${table.sha256}\` |`),
  "",
  "## Dates",
  "",
  "Les dates numériques SQLite sont des millisecondes depuis l'époque Unix : elles représentent un instant absolu et sont converties en ISO 8601 UTC avec suffixe `Z`. Les textes avec décalage explicite sont normalisés en conservant l'instant. Les textes sans fuseau restent inchangés et sont signalés comme ambigus.",
  "",
  `Formats rencontrés : ${Object.entries(temporal.formats).map(([format, count]) => `${format}=${count}`).join(", ") || "aucun"}.`,
  "",
  "## Données sensibles",
  "",
  "Les valeurs sensibles ne figurent pas dans ce rapport. Elles sont conservées sans modification uniquement dans les fichiers JSON de table nécessaires à la migration. Le dossier et les fichiers sont créés avec des permissions locales restrictives lorsque le système le permet.",
  "",
  "## Fichiers orphelins exclus",
  "",
  ...orphanFiles.map((file) => `- \`${file.path}\` — ${file.bytes} octets — SHA-256 inchangé : ${file.hashUnchanged ? "oui" : "non"}`),
  "",
  "Aucun de ces fichiers n'est copié dans l'export métier et aucune ligne `asset_files` n'est créée.",
  "",
  "## Ordre proposé pour l'import",
  "",
  importPlan.insertionOrder.map((table, index) => `${index + 1}. \`${table}\``).join("\n"),
  "",
  `Relations à seconde passe : ${importPlan.selfRelations.map((item) => `${item.table}.${item.column}`).join(", ") || "aucune"}.`,
  `Cycles non résolus hors auto-relations : ${importPlan.unresolvedCycles.join(", ") || "aucun"}.`,
  `Ordre de nettoyage/rollback : ${importPlan.rollbackCleanupOrder.join(" → ")}.`,
  "",
  "## Contrôles bloquants",
  "",
  `- Enums incompatibles : ${invalidEnums.length}`,
  `- Relations SQLite invalides : ${foreignKeyErrors.length}`,
  `- Contrôles sémantiques en erreur : ${relational.semanticChecks.reduce((sum, item) => sum + item.errors, 0)}`,
  `- Exceptions de références d'audit : ${auditReferences.length}`,
  ""
].join("\n");
await writeFile(path.join(outputRoot, "report.md"), report, { encoding: "utf8", mode: 0o600 });

db.close();
const databaseSha256After = await hashFile(databasePath);
if (databaseSha256After !== databaseSha256Before) throw new Error("La base SQLite a changé pendant l'export.");
if (numericValidation.nonIntegerValues.length) throw new Error("Des valeurs non entières ont été détectées dans des colonnes INTEGER.");
console.log(JSON.stringify({
  outputRoot,
  databaseSha256Before,
  databaseSha256After,
  tables: manifestTables.length,
  rows: Object.values(counts).reduce((sum, count) => sum + count, 0),
  totalTableBytes,
  invalidEnums: invalidEnums.length,
  ambiguousTemporalValues: temporal.ambiguousValues.length,
  foreignKeyErrors: foreignKeyErrors.length,
  semanticRelationErrors: relational.semanticChecks.reduce((sum, item) => sum + item.errors, 0),
  auditReferenceExceptions: auditReferences.length,
  assetFilesRows: counts.asset_files,
  orphanFilesExcluded: orphanFiles.length
}, null, 2));
if (invalidEnums.length || temporal.ambiguousValues.length) process.exitCode = 2;
