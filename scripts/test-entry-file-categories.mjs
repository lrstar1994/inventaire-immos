import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { ASSET_FILE_TYPES, isAssetFileType } from "../lib/asset-file-constants.js";

const root = process.cwd();
const service = readFileSync(join(root, "lib", "asset-file-service.js"), "utf8");
const park = readFileSync(join(root, "app", "parc", "asset-park.js"), "utf8");
const sqliteSchema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "immos-entry-file-types-"));
const temporaryDatabase = join(temporaryDirectory, "types.db");
copyFileSync(join(root, "prisma", "dev.db"), temporaryDatabase);
const db = new DatabaseSync(temporaryDatabase);
const entry = db.prepare("SELECT id FROM asset_entries ORDER BY id LIMIT 1").get();

function insertEntryFile(fileType, { fileKind = "MATERIAL_PHOTO", isPrimary = 0 } = {}) {
  const id = randomUUID();
  db.prepare(`INSERT INTO asset_files (
    id, asset_entry_id, file_kind, file_type, file_name, file_path, mime_type,
    file_size, is_primary, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(
    id, entry.id, fileKind, fileType, `${id}.jpg`, `test/${id}`,
    fileKind === "MATERIAL_PHOTO" ? "image/jpeg" : "application/pdf", isPrimary
  );
  return id;
}

test("le vocabulaire structuré contient les catégories photo et document attendues", () => {
  for (const code of ["GENERAL_VIEW", "SERIAL_NUMBER", "VISIBLE_DEFECT", "FULL_LOT", "INVOICE", "DELIVERY_NOTE", "MANUAL", "OTHER"]) {
    assert.equal(isAssetFileType(code), true, code);
    assert.match(sqliteSchema, new RegExp(`\\b${code}\\b`));
  }
  assert.equal(ASSET_FILE_TYPES.find((item) => item.code === "DELIVERY_NOTE")?.category, "document");
  assert.equal(ASSET_FILE_TYPES.find((item) => item.code === "FULL_LOT")?.category, "image");
});

test("une photo sans catégorie métier utilise OTHER et les catégories ciblées restent persistables", () => {
  for (const type of ["OTHER", "GENERAL_VIEW", "SERIAL_NUMBER", "VISIBLE_DEFECT", "FULL_LOT"]) insertEntryFile(type);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM asset_files WHERE asset_entry_id = ?").get(entry.id).count, 5);
});

test("les justificatifs facture et bon de livraison restent distincts", () => {
  insertEntryFile("INVOICE", { fileKind: "SUPPORTING_DOCUMENT" });
  insertEntryFile("DELIVERY_NOTE", { fileKind: "SUPPORTING_DOCUMENT" });
  const types = db.prepare("SELECT file_type FROM asset_files WHERE asset_entry_id = ? AND file_kind = 'SUPPORTING_DOCUMENT' ORDER BY file_type").all(entry.id);
  assert.deepEqual(types.map((row) => row.file_type), ["DELIVERY_NOTE", "INVOICE"]);
});

test("la validation serveur refuse les types photo pour les justificatifs", () => {
  assert.match(service, /SUPPORTING_DOCUMENT" && !\["INVOICE", "DELIVERY_NOTE", "WARRANTY", "MANUAL", "OTHER"\]\.includes\(fileType\)/);
  assert.match(service, /MATERIAL_PHOTO" && \["INVOICE", "DELIVERY_NOTE", "WARRANTY", "MANUAL"\]\.includes\(fileType\)/);
});

test("la catégorie et la photo principale restent indépendantes", () => {
  const primaryId = insertEntryFile("FRONT", { isPrimary: 1 });
  const row = db.prepare("SELECT file_type, is_primary FROM asset_files WHERE id = ?").get(primaryId);
  assert.deepEqual({ ...row }, { file_type: "FRONT", is_primary: 1 });
  assert.match(service, /body\.fileType !== undefined/);
  assert.match(service, /body\.isPrimary !== undefined/);
});

test("l'UI garde la catégorie facultative, filtrée par nature et modifiable après upload", () => {
  assert.match(park, /initialEntryPhotoForm = \{ files: \[\], fileType: "OTHER"/);
  assert.match(park, /initialEntryDocumentForm = \{ files: \[\], fileType: "OTHER"/);
  assert.match(park, /Catégorie \(facultatif\)/);
  assert.match(park, /entryFileTypeOptions\("MATERIAL_PHOTO"\)/);
  assert.match(park, /entryFileTypeOptions\("SUPPORTING_DOCUMENT"\)/);
  assert.match(park, /updateEntryFileType\(file\.id, event\.target\.value\)/);
  assert.match(park, /multiple accept="image\/\*"/);
});

test("suppression logique et valeurs historiques restent conservées", () => {
  for (const legacy of ["MAIN_PHOTO", "DETAIL_VIEW", "DEFECT_PHOTO", "SERIAL_OR_LABEL"]) assert.equal(isAssetFileType(legacy), true);
  assert.match(service, /data: \{ deletedAt: new Date\(\), isPrimary: false \}/);
});

test.after(() => {
  db.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});
