import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../generated/prisma-lot6/index.js";

const root = process.cwd();
const schemaPath = path.join(root, "prisma", "schema.prisma");
const migrationsRoot = path.join(root, "prisma", "migrations");
const envPath = path.join(root, ".env");
const outputRoot = path.join(root, "outputs", "migration", "sqlite-repair");

const envText = await readFile(envPath, "utf8");
const databaseUrl = envText.match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m)?.[1] || null;
if (!databaseUrl?.startsWith("file:")) throw new Error("DATABASE_URL SQLite locale attendue.");
const relativeDatabasePath = databaseUrl.slice("file:".length);
const resolvedDatabasePath = path.resolve(path.dirname(schemaPath), relativeDatabasePath);

const migrationNames = (await readdir(migrationsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const migrationFiles = [];
for (const migrationName of migrationNames) {
  const sqlPath = path.join(migrationsRoot, migrationName, "migration.sql");
  const sql = await readFile(sqlPath, "utf8");
  migrationFiles.push({
    migrationName,
    sqlPath,
    sha256: createHash("sha256").update(sql).digest("hex"),
    createsTables: [...sql.matchAll(/CREATE TABLE\s+"([^"]+)"/g)].map((match) => match[1]),
    createsIndexes: [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX\s+"([^"]+)"/g)].map((match) => match[1])
  });
}

const db = new DatabaseSync(resolvedDatabasePath, { readOnly: true });
db.exec("PRAGMA query_only = ON");
const databaseList = db.prepare("PRAGMA database_list").all();
const actualTables = db.prepare(
  "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
).all();
const actualIndexes = db.prepare(
  "SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
).all();
const hasMigrationTable = actualTables.some((table) => table.name === "_prisma_migrations");
const recordedMigrations = hasMigrationTable
  ? db.prepare(
      `SELECT id, checksum, migration_name, started_at, finished_at, rolled_back_at,
              applied_steps_count, logs
       FROM "_prisma_migrations" ORDER BY started_at, migration_name`
    ).all()
  : [];
const integrityCheck = db.prepare("PRAGMA integrity_check").get().integrity_check;
const foreignKeyCheck = db.prepare("PRAGMA foreign_key_check").all();
db.close();

const prisma = new PrismaClient({ log: ["error"] });
let applicationDatabaseList;
let applicationProbe;
try {
  applicationDatabaseList = await prisma.$queryRawUnsafe("PRAGMA database_list");
  applicationProbe = {
    users: await prisma.user.count(),
    assetUnits: await prisma.assetUnit.count()
  };
  try {
    applicationProbe.assetFiles = await prisma.assetFile.count();
  } catch (error) {
    applicationProbe.assetFilesError = {
      code: error.code,
      message: String(error.message).replace(/\s+/g, " ").trim()
    };
  }
} finally {
  await prisma.$disconnect();
}

const recordedNames = new Set(recordedMigrations.filter((item) => item.finished_at && !item.rolled_back_at).map((item) => item.migration_name));
const missingRecords = migrationNames.filter((name) => !recordedNames.has(name));
const unexpectedRecords = recordedMigrations.filter((item) => !migrationNames.includes(item.migration_name));
const expectedTables = new Set(migrationFiles.flatMap((migration) => migration.createsTables));
const actualTableNames = new Set(actualTables.map((table) => table.name));
const absentExpectedTables = [...expectedTables].filter((table) => !actualTableNames.has(table));
const expectedIndexes = new Set(migrationFiles.flatMap((migration) => migration.createsIndexes));
const actualIndexNames = new Set(actualIndexes.map((index) => index.name));
const absentExpectedIndexes = [...expectedIndexes].filter((index) => !actualIndexNames.has(index));
const lot6 = migrationFiles.find((migration) => migration.migrationName === "20260608100000_lot_6_asset_files");
const lot6Record = recordedMigrations.find((migration) => migration.migration_name === "20260608100000_lot_6_asset_files") || null;

const report = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  databaseUrl,
  resolutionRule: "Une URL SQLite relative du datasource Prisma est résolue depuis le dossier du schéma Prisma.",
  schemaPath,
  resolvedDatabasePath,
  sqliteDatabaseList: databaseList,
  applicationDatabaseList,
  applicationProbe,
  integrityCheck,
  foreignKeyCheck,
  migrationDirectoryCount: migrationNames.length,
  migrationFiles,
  prismaMigrationTablePresent: hasMigrationTable,
  recordedMigrations,
  missingMigrationRecords: missingRecords,
  unexpectedMigrationRecords: unexpectedRecords,
  actualTables,
  actualIndexes,
  absentExpectedTables,
  absentExpectedIndexes,
  lot6: {
    migrationFile: lot6,
    recordedMigration: lot6Record,
    tablePresent: actualTableNames.has("asset_files"),
    expectedIndexesPresent: lot6?.createsIndexes.map((name) => ({ name, present: actualIndexNames.has(name) })) || []
  },
  probableCause: null
};

if (!hasMigrationTable) {
  report.probableCause = "La base a été construite par le script local sans historique Prisma antérieur, ou l'historique a été supprimé.";
} else if (!lot6Record && !actualTableNames.has("asset_files")) {
  report.probableCause = "La migration Lot 6 est présente sur disque mais n'a jamais été appliquée ni enregistrée dans cette base SQLite.";
} else if (lot6Record && !actualTableNames.has("asset_files")) {
  report.probableCause = "La migration Lot 6 est enregistrée comme appliquée mais sa structure est absente : historique incohérent ou table supprimée après migration.";
} else {
  report.probableCause = "Aucune incohérence Lot 6 détectée.";
}

await mkdir(outputRoot, { recursive: true });
const jsonPath = path.join(outputRoot, "diagnostic-before-repair.json");
const markdownPath = path.join(outputRoot, "diagnostic-before-repair.md");
const json = JSON.stringify(report, (_key, value) => typeof value === "bigint" ? Number(value) : value, 2);
await writeFile(jsonPath, `${json}\n`, "utf8");
await writeFile(markdownPath, [
  "# Diagnostic SQLite avant réparation",
  "",
  `- Généré : ${report.generatedAt}`,
  `- Lecture seule : oui`,
  `- DATABASE_URL : \`${databaseUrl}\``,
  `- Base résolue : \`${resolvedDatabasePath}\``,
  `- Base ouverte par Prisma : \`${applicationDatabaseList?.[0]?.file || "non déterminée"}\``,
  `- Intégrité SQLite : \`${integrityCheck}\``,
  `- Dossiers de migration : ${migrationNames.length}`,
  `- Migrations enregistrées : ${recordedMigrations.length}`,
  `- Tables applicatives présentes hors _prisma_migrations : ${actualTables.filter((table) => table.name !== "_prisma_migrations").length}`,
  "",
  "## Migration Lot 6",
  "",
  `- Fichier présent : ${Boolean(lot6)}`,
  `- Enregistrement _prisma_migrations : ${Boolean(lot6Record)}`,
  `- Table asset_files présente : ${actualTableNames.has("asset_files")}`,
  `- Index Lot 6 absents : ${report.lot6.expectedIndexesPresent.filter((index) => !index.present).map((index) => index.name).join(", ") || "aucun"}`,
  "",
  "## Écarts",
  "",
  `- Migrations non enregistrées : ${missingRecords.join(", ") || "aucune"}`,
  `- Tables attendues absentes : ${absentExpectedTables.join(", ") || "aucune"}`,
  `- Index attendus absents : ${absentExpectedIndexes.join(", ") || "aucun"}`,
  "",
  "## Cause la plus probable",
  "",
  report.probableCause,
  "",
  "Le détail complet de l'historique, des checksums et des structures SQL se trouve dans le rapport JSON.",
  ""
].join("\n"), "utf8");

console.log(JSON.stringify({ jsonPath, markdownPath, probableCause: report.probableCause }, null, 2));
