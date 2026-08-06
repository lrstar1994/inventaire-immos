import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const workspace = path.resolve(process.cwd());
const protectedDatabase = path.resolve(workspace, "prisma/dev.db");
const allowedRoot = path.resolve(workspace, "tmp/phase10f-c");
const backupRoot = path.resolve(workspace, "backups/phase10f-d");
const sqlPath = path.resolve(workspace, "scripts/sql/phase10f-c-align-asset-files-sqlite-copy.sql");
const confirmation = "--confirm-copy-only";
const realConfirmation = "--confirm-real-sqlite-phase10f-d";
const protectedHistoricalSha256 = "8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec";

const historicalColumns = [
  ["id", "TEXT", 1],
  ["asset_unit_id", "TEXT", 1],
  ["file_type", "TEXT", 1],
  ["file_label", "TEXT", 0],
  ["file_name", "TEXT", 1],
  ["file_path", "TEXT", 1],
  ["mime_type", "TEXT", 1],
  ["file_size", "INTEGER", 1],
  ["is_primary", "BOOLEAN", 1],
  ["notes", "TEXT", 0],
  ["created_by", "TEXT", 0],
  ["created_at", "DATETIME", 1],
  ["deleted_at", "DATETIME", 0]
];
const additiveColumns = [
  ["storage_provider", "TEXT", 0],
  ["storage_bucket", "TEXT", 0],
  ["storage_key", "TEXT", 0],
  ["updated_at", "DATETIME", 1]
];

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedColumns(db) {
  return db.prepare("PRAGMA table_info('asset_files')").all()
    .map((column) => [column.name, String(column.type).toUpperCase(), column.notnull]);
}

function sameColumns(actual, expected) {
  return actual.length === expected.length &&
    actual.every((column, index) => column.every((value, part) => value === expected[index][part]));
}

function logicalSnapshot(db) {
  const columns = historicalColumns.map(([name]) => `"${name}"`).join(", ");
  const rows = db.prepare(`SELECT ${columns} FROM "asset_files" ORDER BY "id"`).all();
  const indexes = db.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='asset_files' ORDER BY name"
  ).all();
  const foreignKeys = db.prepare("PRAGMA foreign_key_list('asset_files')").all();
  return {
    rows: rows.length,
    historicalDataSha256: digest(JSON.stringify(rows)),
    indexesSha256: digest(JSON.stringify(indexes)),
    foreignKeysSha256: digest(JSON.stringify(foreignKeys))
  };
}

function parseArgs(argv) {
  const databaseIndex = argv.indexOf("--database");
  if (databaseIndex < 0 || !argv[databaseIndex + 1]) {
    throw new Error("COPY_DATABASE_REQUIRED");
  }
  const confirmsCopy = argv.includes(confirmation);
  const confirmsReal = argv.includes(realConfirmation);
  if (confirmsCopy === confirmsReal) throw new Error("EXACTLY_ONE_CONFIRMATION_REQUIRED");
  if (confirmsCopy) return { database: argv[databaseIndex + 1], allowProtected: false };
  const backupIndex = argv.indexOf("--verified-backup");
  if (backupIndex < 0 || !argv[backupIndex + 1]) throw new Error("VERIFIED_BACKUP_REQUIRED");
  return {
    database: argv[databaseIndex + 1],
    allowProtected: true,
    backupPath: argv[backupIndex + 1]
  };
}

function assertInside(root, requested, errorCode) {
  const relative = path.relative(root, requested);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(errorCode);
}

async function verifyProtectedBackup(backupArgument) {
  if (!backupArgument) throw new Error("VERIFIED_BACKUP_REQUIRED");
  const requested = path.resolve(workspace, backupArgument);
  assertInside(backupRoot, requested, "BACKUP_OUTSIDE_ALLOWED_ROOT");
  if (requested === protectedDatabase) throw new Error("BACKUP_MUST_BE_DISTINCT");
  const resolved = await realpath(requested);
  const bytes = await readFile(resolved);
  if (digest(bytes) !== protectedHistoricalSha256) throw new Error("BACKUP_SHA256_MISMATCH");
  const db = new DatabaseSync(resolved, { readOnly: true });
  try {
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") {
      throw new Error("BACKUP_INTEGRITY_FAILED");
    }
    if (db.prepare("PRAGMA foreign_key_check").all().length !== 0) {
      throw new Error("BACKUP_FOREIGN_KEY_CHECK_FAILED");
    }
    if (!sameColumns(normalizedColumns(db), historicalColumns)) {
      throw new Error("BACKUP_STRUCTURE_MISMATCH");
    }
    return { resolved, snapshot: logicalSnapshot(db) };
  } finally {
    db.close();
  }
}

export async function alignSQLiteCopy(databaseArgument, options = {}) {
  if (/^(?:postgres(?:ql)?|file):\/\//i.test(databaseArgument)) {
    throw new Error("FILESYSTEM_SQLITE_PATH_REQUIRED");
  }
  const requested = path.resolve(workspace, databaseArgument);
  const targetsProtected = requested === protectedDatabase;
  if (targetsProtected && !options.allowProtected) throw new Error("PROTECTED_SQLITE_REFUSED");
  if (!targetsProtected && options.allowProtected) throw new Error("REAL_CONFIRMATION_TARGET_MISMATCH");
  if (!targetsProtected) assertInside(allowedRoot, requested, "COPY_OUTSIDE_ALLOWED_ROOT");
  if (path.extname(requested).toLowerCase() !== ".db") throw new Error("SQLITE_DB_EXTENSION_REQUIRED");

  const resolved = await realpath(requested);
  const protectedResolved = await realpath(protectedDatabase);
  if (!options.allowProtected && resolved === protectedResolved) {
    throw new Error("PROTECTED_SQLITE_ALIAS_REFUSED");
  }
  if (options.allowProtected && resolved !== protectedResolved) {
    throw new Error("REAL_CONFIRMATION_RESOLVED_TARGET_MISMATCH");
  }
  const verifiedBackup = options.allowProtected
    ? await verifyProtectedBackup(options.backupPath)
    : null;
  const bytesBefore = await readFile(resolved);
  if (bytesBefore.subarray(0, 16).toString("utf8") !== "SQLite format 3\u0000") {
    throw new Error("INVALID_SQLITE_FILE");
  }

  const db = new DatabaseSync(resolved);
  try {
    db.exec("PRAGMA foreign_keys=ON");
    const table = db.prepare(
      "SELECT type FROM sqlite_master WHERE name='asset_files'"
    ).get();
    if (table?.type !== "table") throw new Error("ASSET_FILES_TABLE_REQUIRED");

    const beforeColumns = normalizedColumns(db);
    const expectedAligned = [...historicalColumns, ...additiveColumns];
    const protectedSnapshot = logicalSnapshot(db);
    if (verifiedBackup &&
        JSON.stringify(protectedSnapshot) !== JSON.stringify(verifiedBackup.snapshot)) {
      throw new Error("PROTECTED_DATABASE_DIFFERS_FROM_BACKUP");
    }
    if (sameColumns(beforeColumns, expectedAligned)) {
      return {
        result: "ALREADY_ALIGNED",
        database: path.relative(workspace, resolved).replaceAll("\\", "/"),
        databaseSha256: digest(bytesBefore),
        sourceProtected: options.allowProtected === true,
        verifiedBackup: verifiedBackup
          ? path.relative(workspace, verifiedBackup.resolved).replaceAll("\\", "/")
          : null,
        snapshot: protectedSnapshot
      };
    }
    if (!sameColumns(beforeColumns, historicalColumns)) {
      throw new Error("UNEXPECTED_ASSET_FILES_STRUCTURE");
    }

    const before = logicalSnapshot(db);
    if (before.rows !== 0) throw new Error("NONEMPTY_ASSET_FILES_REHEARSAL_REFUSED");
    const sql = await readFile(sqlPath, "utf8");
    const statements = sql.split(";").map((item) => item.trim()).filter(Boolean);
    if (statements.length !== 4 ||
        statements.some((statement) => !/^ALTER TABLE "asset_files" ADD COLUMN /i.test(statement))) {
      throw new Error("ADDITIVE_SQL_CONTRACT_REFUSED");
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      for (const statement of statements) db.exec(`${statement};`);
      const afterColumns = normalizedColumns(db);
      if (!sameColumns(afterColumns, expectedAligned)) {
        throw new Error("POST_ALIGNMENT_STRUCTURE_MISMATCH");
      }
      const after = logicalSnapshot(db);
      if (JSON.stringify(after) !== JSON.stringify(before)) {
        throw new Error("HISTORICAL_STATE_CHANGED");
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return {
      result: "COPY_ALIGNED",
      database: path.relative(workspace, resolved).replaceAll("\\", "/"),
      sourceProtected: options.allowProtected === true,
      verifiedBackup: verifiedBackup
        ? path.relative(workspace, verifiedBackup.resolved).replaceAll("\\", "/")
        : null,
      columnsAdded: additiveColumns.map(([name]) => name),
      before,
      after: logicalSnapshot(db)
    };
  } finally {
    db.close();
  }
}

const invokedDirectly = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const parsed = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify(
    await alignSQLiteCopy(parsed.database, parsed),
    null,
    2
  ));
}
