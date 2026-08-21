import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { buildAssetEntryStorageKey } from "../lib/storage/storage-key.js";

const root = process.cwd();
const migrationPath = join(root, "prisma", "migrations", "20260821120000_add_asset_entry_files", "migration.sql");
const postgresqlMigrationPath = join(root, "prisma", "postgresql", "migrations", "20260821120000_add_asset_entry_files", "migration.sql");
const recipeMigrationPath = join(root, "prisma", "postgresql-recipe", "migrations", "20260821120000_add_asset_entry_files", "migration.sql");
const migration = readFileSync(migrationPath, "utf8");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "immos-entry-files-"));
const temporaryDatabase = join(temporaryDirectory, "entry-files.db");
copyFileSync(join(root, "prisma", "dev.db"), temporaryDatabase);

const db = new DatabaseSync(temporaryDatabase);
const existingColumns = db.prepare("PRAGMA table_info('asset_files')").all().map((row) => row.name);
if (!existingColumns.includes("asset_entry_id")) db.exec(migration);

const entry = db.prepare("SELECT id FROM asset_entries ORDER BY id LIMIT 1").get();
const unit = db.prepare("SELECT id FROM asset_units ORDER BY id LIMIT 1").get();
assert.ok(entry?.id, "Une entrée historique est nécessaire au test isolé.");
assert.ok(unit?.id, "Une unité historique est nécessaire au test isolé.");

function insertFile({
  id = randomUUID(),
  assetEntryId = entry.id,
  assetUnitId = null,
  fileKind = "MATERIAL_PHOTO",
  fileType = "GENERAL_VIEW",
  mimeType = "image/jpeg",
  isPrimary = 0,
  deletedAt = null
} = {}) {
  db.prepare(`
    INSERT INTO asset_files (
      id, asset_unit_id, asset_entry_id, file_kind, file_type, file_name, file_path,
      mime_type, file_size, is_primary, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
  `).run(
    id,
    assetUnitId,
    assetEntryId,
    fileKind,
    fileType,
    `${id}.jpg`,
    `test/${id}`,
    mimeType,
    10,
    isPrimary,
    deletedAt
  );
  return id;
}

test("AssetEntry accepte plusieurs photos et une pièce justificative", () => {
  insertFile({ isPrimary: 1 });
  insertFile();
  insertFile({ fileKind: "SUPPORTING_DOCUMENT", fileType: "INVOICE", mimeType: "application/pdf" });
  const result = db.prepare("SELECT file_kind, COUNT(*) AS count FROM asset_files WHERE asset_entry_id = ? GROUP BY file_kind ORDER BY file_kind").all(entry.id);
  assert.deepEqual(result.map((row) => ({ ...row })), [
    { file_kind: "MATERIAL_PHOTO", count: 2 },
    { file_kind: "SUPPORTING_DOCUMENT", count: 1 }
  ]);
});

test("une seule photo principale active est autorisée par entrée", () => {
  assert.throws(() => insertFile({ isPrimary: 1 }), /UNIQUE constraint failed/);
});

test("une pièce justificative ne peut pas être principale", () => {
  assert.throws(
    () => insertFile({ fileKind: "SUPPORTING_DOCUMENT", fileType: "INVOICE", mimeType: "application/pdf", isPrimary: 1 }),
    /CHECK constraint failed/
  );
});

test("un fichier possède exactement un propriétaire", () => {
  assert.throws(() => insertFile({ assetUnitId: unit.id }), /CHECK constraint failed/);
  assert.throws(() => insertFile({ assetEntryId: null, assetUnitId: null }), /CHECK constraint failed/);
});

test("les fichiers AssetUnit historiques restent compatibles", () => {
  const id = insertFile({ assetEntryId: null, assetUnitId: unit.id, fileKind: null });
  const row = db.prepare("SELECT asset_unit_id, asset_entry_id, file_kind FROM asset_files WHERE id = ?").get(id);
  assert.deepEqual({ ...row }, { asset_unit_id: unit.id, asset_entry_id: null, file_kind: null });
});

test("la suppression logique conserve la ligne et retire la principale", () => {
  const id = insertFile();
  db.prepare("UPDATE asset_files SET deleted_at = CURRENT_TIMESTAMP, is_primary = 0 WHERE id = ?").run(id);
  const row = db.prepare("SELECT deleted_at, is_primary FROM asset_files WHERE id = ?").get(id);
  assert.ok(row.deleted_at);
  assert.equal(row.is_primary, 0);
});

test("les migrations distantes restent additives et ciblées", () => {
  for (const path of [postgresqlMigrationPath, recipeMigrationPath]) {
    const sql = readFileSync(path, "utf8");
    assert.match(sql, /ADD COLUMN "asset_entry_id"/);
    assert.match(sql, /asset_files_owner_check/);
    assert.match(sql, /asset_files_active_entry_primary_key/);
    assert.doesNotMatch(sql, /^\s*(?:DROP TABLE|DELETE FROM|INSERT INTO|UPDATE )/im);
  }
});

test("la clé Storage d'entrée est isolée sous assets/entries", () => {
  assert.equal(
    buildAssetEntryStorageKey({ assetEntryId: "entry-1", fileId: "file-1", extension: ".jpg" }),
    "assets/entries/entry-1/file-1/file-1.jpg"
  );
});

test("le service et l'API utilisent le propriétaire entrée sans toucher Q/QI", () => {
  const service = readFileSync(join(root, "lib", "asset-file-service.js"), "utf8");
  const collectionRoute = readFileSync(join(root, "app", "api", "asset-entries", "[id]", "files", "route.js"), "utf8");
  const itemRoute = readFileSync(join(root, "app", "api", "asset-entries", "[id]", "files", "[fileId]", "route.js"), "utf8");
  assert.match(service, /saveAssetEntryFileFromForm/);
  assert.match(service, /assetEntryId: owner\.id, assetUnitId: null/);
  assert.doesNotMatch(service, /QuantitativeStockPosition|quantitativeStockPosition|QuantitativeMovementLine/);
  assert.match(collectionRoute, /export async function GET/);
  assert.match(collectionRoute, /export async function POST/);
  assert.match(itemRoute, /export async function PATCH/);
  assert.match(itemRoute, /export async function DELETE/);
});

test.after(() => {
  db.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});
