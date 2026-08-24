import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const root = process.cwd();
const service = readFileSync(join(root, "lib", "asset-service.js"), "utf8");
const collectionRoute = readFileSync(join(root, "app", "api", "asset-entries", "route.js"), "utf8");
const draftRoute = readFileSync(join(root, "app", "api", "asset-entries", "drafts", "route.js"), "utf8");
const itemRoute = readFileSync(join(root, "app", "api", "asset-entries", "[id]", "route.js"), "utf8");
const validateRoute = readFileSync(join(root, "app", "api", "asset-entries", "[id]", "validate", "route.js"), "utf8");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "immos-entry-draft-"));
const temporaryDatabase = join(temporaryDirectory, "draft.db");
copyFileSync(join(root, "prisma", "dev.db"), temporaryDatabase);
const db = new DatabaseSync(temporaryDatabase);
db.exec("PRAGMA foreign_keys=ON");

test("la route historique reste compatible et une route dédiée crée les brouillons", () => {
  assert.match(collectionRoute, /createAssetEntryByTrackingMode/);
  assert.match(draftRoute, /createAssetEntryDraft/);
  assert.match(draftRoute, /status: 201/);
});

test("un brouillon I/Q/QI ne crée aucun patrimoine", () => {
  assert.match(service, /entryStatus: "DRAFT"/);
  assert.match(service, /units: \[\], quantitativePosition: null/);
  const draftBlock = service.slice(service.indexOf("export async function createAssetEntryDraft"), service.indexOf("export async function updateAssetEntryDraft"));
  assert.doesNotMatch(draftBlock, /assetUnit\.create|quantitativeStockPosition\.create/);
});

test("la modification conserve id, numéro et statut DRAFT", () => {
  assert.match(service, /entryNumber: current\.entryNumber, entryStatus: "DRAFT"/);
  assert.match(service, /assetEntry\.update\(\{ where: \{ id \}/);
  assert.match(service, /entryStatus === "VALIDATED"[\s\S]*ENTRY_ALREADY_VALIDATED/);
  assert.match(itemRoute, /updateAssetEntryDraft/);
});

test("la validation relit le mode et branche I séparément de Q et QI", () => {
  assert.match(service, /const trackingMode = assertOperationalEntryMode\(assetItem\)/);
  assert.match(service, /if \(trackingMode === "I"\)/);
  assert.match(service, /createUnitsForValidatedEntry/);
  assert.match(service, /quantitativeStockPosition\.create/);
});

test("I crée les unités existantes et Q/QI créent une position sans unité", () => {
  assert.match(service, /units = await createUnitsForValidatedEntry/);
  assert.match(service, /availableQuantity: current\.quantity/);
  assert.match(service, /let units = \[\];\s*let quantitativePosition = null/);
});

test("la double validation est réclamée atomiquement une seule fois", () => {
  assert.match(service, /assetEntry\.updateMany\(\{\s*where: \{ id, entryStatus: "DRAFT" \}/);
  assert.match(service, /claimed\.count !== 1/);
  assert.match(service, /ENTRY_ALREADY_VALIDATED/);
  assert.match(service, /ENTRY_DRAFT_HAS_PATRIMONY/);
});

test("la validation est contenue dans une transaction avec timeout borné", () => {
  const validationBlock = service.slice(service.indexOf("export async function validateAssetEntryDraft"));
  assert.match(validationBlock, /prismaClient\.\$transaction\(async \(tx\) =>/);
  assert.match(validationBlock, /maxWait: 10000, timeout: 30000/);
  assert.match(validationBlock, /tx\.auditLog\.create/);
});

test("une erreur transactionnelle conserve réellement le statut DRAFT", () => {
  const source = db.prepare("SELECT * FROM asset_entries ORDER BY id LIMIT 1").get();
  const id = "draft-rollback-test";
  db.prepare(`INSERT INTO asset_entries (
    id, entry_number, asset_item_id, location_id, supplier_id, quantity, entry_type,
    entry_date, initial_condition, initial_status, entry_status, information_status,
    purchase_date, purchase_date_known, supplier_known, unit_price, total_price,
    price_known, invoice_available, invoice_reference, notes, created_at, updated_at,
    created_by, updated_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)`).run(
    id, "ENT-2099-999999", source.asset_item_id, source.location_id, source.supplier_id,
    source.quantity, source.entry_type, source.entry_date, source.initial_condition,
    source.initial_status, source.information_status, source.purchase_date,
    source.purchase_date_known, source.supplier_known, source.unit_price,
    source.total_price, source.price_known, source.invoice_available,
    source.invoice_reference, source.notes, source.created_by, source.updated_by
  );
  try {
    db.exec("BEGIN");
    db.prepare("UPDATE asset_entries SET entry_status = 'VALIDATED' WHERE id = ? AND entry_status = 'DRAFT'").run(id);
    db.prepare("INSERT INTO quantitative_stock_positions (id, asset_entry_id, location_id, available_quantity, created_at, updated_at) VALUES ('bad-position', ?, 'missing-location', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").run(id);
    db.exec("COMMIT");
    assert.fail("La FK devait provoquer un rollback.");
  } catch {
    db.exec("ROLLBACK");
  }
  assert.equal(db.prepare("SELECT entry_status FROM asset_entries WHERE id = ?").get(id).entry_status, "DRAFT");
});

test("les fichiers liés ne sont ni copiés ni supprimés à la validation", () => {
  const validationBlock = service.slice(service.indexOf("export async function validateAssetEntryDraft"));
  assert.doesNotMatch(validationBlock, /assetFile\.(?:create|update|delete)/);
});

test("la lecture retourne le brouillon et une progression calculée légère", () => {
  assert.match(itemRoute, /computeAssetEntryProgress/);
  assert.match(itemRoute, /_count: \{ select: \{ assetFiles/);
  assert.match(service, /readyToValidate: identification && assignment/);
});

test("la route dédiée expose uniquement la validation finale", () => {
  assert.match(validateRoute, /export async function POST/);
  assert.match(validateRoute, /validateAssetEntryDraft/);
  assert.match(validateRoute, /ENTRY_ALREADY_VALIDATED|error\.code/);
});

test.after(() => {
  db.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});
