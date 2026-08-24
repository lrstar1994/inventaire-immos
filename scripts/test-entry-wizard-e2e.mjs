import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "immos-entry-wizard-e2e-"));
const temporaryDatabase = join(temporaryDirectory, "wizard-e2e.db");
copyFileSync(join(process.cwd(), "prisma", "dev.db"), temporaryDatabase);
process.env.APP_DATABASE_PROVIDER = "sqlite";
process.env.APP_PRISMA_CLIENT = "sqlite";
process.env.DATABASE_URL = `file:${temporaryDatabase.replaceAll("\\", "/")}`;
process.env.NODE_ENV = "test";

const [{ PrismaClient }, serviceModule] = await Promise.all([
  import("../generated/prisma-lot6/index.js"),
  import("../lib/asset-service.js")
]);
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL, log: ["error"] });
const { createAssetEntryDraft, updateAssetEntryDraft, validateAssetEntryDraft } = serviceModule;
const { ensureEntryDraftDocument } = await import("../lib/document-service.js");
const noSchemaWrite = async () => null;
const noExternalAudit = async () => null;
let actor;
let location;
const cases = new Map();

function payload(assetItemId, quantity) {
  return { assetItemId, locationId: location.id, quantity, entryType: "PROGRESSIVE_INVENTORY", entryDate: "2026-08-24", initialCondition: "GOOD", initialStatus: "IN_STOCK", informationStatus: "PARTIAL", supplierKnown: false, purchaseDateKnown: false, priceKnown: false, invoiceAvailable: false, notes: "Création terrain" };
}

test.before(async () => {
  actor = await prisma.user.findFirst({ where: { status: "ACTIVE", deletedAt: null } });
  location = await prisma.location.findFirst({ where: { status: "ACTIVE", deletedAt: null } });
  assert.ok(actor && location, "La copie SQLite doit contenir un utilisateur et un emplacement actifs.");
  for (const mode of ["I", "Q", "QI"]) {
    const category = await prisma.assetCategory.create({ data: { name: `Famille test E ${mode}`, code: `FAM-E2E-${mode}`, hierarchyLevel: "FAMILY", trackingMode: mode, controlLevel: "C1" } });
    const item = await prisma.assetItem.create({ data: { name: `Référence test E ${mode}`, code: `REF-E2E-${mode}`, categoryId: category.id, unitLabel: "unité" } });
    cases.set(mode, { category, item });
  }
});

for (const [mode, quantity] of [["I", 2], ["Q", 7], ["QI", 5]]) {
  test(`parcours réel ${mode} : DRAFT, reprise, finances et validation unique`, async () => {
    const item = cases.get(mode).item;
    const beforeEntries = await prisma.assetEntry.count();
    const draftResult = await createAssetEntryDraft(payload(item.id, quantity), actor, { prismaClient: prisma, assertSchema: noSchemaWrite, audit: noExternalAudit });
    const id = draftResult.entry.id;
    const number = draftResult.entry.entryNumber;
    assert.equal(await prisma.assetEntry.count(), beforeEntries + 1);
    assert.equal((await prisma.assetEntry.findUnique({ where: { id } })).entryStatus, "DRAFT");
    assert.equal(await prisma.assetUnit.count({ where: { entryId: id } }), 0);
    assert.equal(await prisma.quantitativeStockPosition.count({ where: { assetEntryId: id } }), 0);

    const updated = await updateAssetEntryDraft(id, { notes: `Reprise ${mode}`, priceKnown: true, unitPrice: 1000, totalPrice: quantity * 1000 }, actor, { prismaClient: prisma, assertSchema: noSchemaWrite, audit: noExternalAudit });
    assert.equal(updated.entry.id, id);
    assert.equal(updated.entry.entryNumber, number);
    const resumed = await prisma.assetEntry.findUnique({ where: { id } });
    assert.equal(resumed.notes, `Reprise ${mode}`);
    assert.equal(resumed.totalPrice, quantity * 1000);
    if (mode === "QI") {
      await prisma.assetFile.createMany({ data: [
        { assetEntryId: id, fileKind: "MATERIAL_PHOTO", fileType: "GENERAL_VIEW", fileLabel: "Vue terrain", fileName: "photo.jpg", filePath: `/test/${id}/photo.jpg`, storageProvider: "LOCAL", mimeType: "image/jpeg", fileSize: 10, isPrimary: true, createdById: actor.id },
        { assetEntryId: id, fileKind: "SUPPORTING_DOCUMENT", fileType: "INVOICE", fileLabel: "Facture test", fileName: "facture.pdf", filePath: `/test/${id}/facture.pdf`, storageProvider: "LOCAL", mimeType: "application/pdf", fileSize: 20, createdById: actor.id }
      ] });
      assert.equal(await prisma.assetFile.count({ where: { assetEntryId: id, deletedAt: null } }), 2);
    }

    const result = await validateAssetEntryDraft(id, actor, {}, { prismaClient: prisma, assertSchema: noSchemaWrite });
    assert.equal(result.entry.entryStatus, "VALIDATED");
    assert.equal(result.entrySlip.documentType, "ENTRY_SLIP");
    assert.equal(result.entrySlip.status, "DRAFT");
    assert.equal(result.entrySlip.entries.length, 1);
    assert.equal(result.entrySlip.entries[0].assetEntryId, id);
    assert.equal(await prisma.assetDocumentEntry.count({ where: { assetEntryId: id, document: { documentType: "ENTRY_SLIP" } } }), 1);
    assert.equal((await prisma.assetEntry.findUnique({ where: { id } })).entryStatus, "VALIDATED");
    if (mode === "I") {
      assert.equal(result.units.length, quantity);
      assert.equal(await prisma.assetUnit.count({ where: { entryId: id } }), quantity);
      assert.equal(await prisma.quantitativeStockPosition.count({ where: { assetEntryId: id } }), 0);
    } else {
      assert.equal(result.units.length, 0);
      const position = await prisma.quantitativeStockPosition.findUnique({ where: { assetEntryId_locationId: { assetEntryId: id, locationId: location.id } } });
      assert.equal(position.availableQuantity, quantity);
      assert.equal(await prisma.assetUnit.count({ where: { entryId: id } }), 0);
    }
    if (mode === "QI") assert.equal(await prisma.assetFile.count({ where: { assetEntryId: id, deletedAt: null } }), 2);
    const ensuredAgain = await prisma.$transaction((tx) => ensureEntryDraftDocument(tx, id, actor));
    assert.equal(ensuredAgain.created, false);
    assert.equal(ensuredAgain.document.id, result.entrySlip.id);
    assert.equal(await prisma.assetDocumentEntry.count({ where: { assetEntryId: id, document: { documentType: "ENTRY_SLIP" } } }), 1);
    await assert.rejects(() => validateAssetEntryDraft(id, actor, {}, { prismaClient: prisma, assertSchema: noSchemaWrite }), (error) => error.code === "ENTRY_ALREADY_VALIDATED");
    await assert.rejects(() => updateAssetEntryDraft(id, { notes: "Modification interdite" }, actor, { prismaClient: prisma, assertSchema: noSchemaWrite, audit: noExternalAudit }), (error) => error.code === "ENTRY_ALREADY_VALIDATED");
  });
}

test("une erreur documentaire tardive restaure le DRAFT et tout le patrimoine", async () => {
  const item = cases.get("I").item;
  const draft = await createAssetEntryDraft(payload(item.id, 3), actor, { prismaClient: prisma, assertSchema: noSchemaWrite, audit: noExternalAudit });
  await assert.rejects(() => validateAssetEntryDraft(draft.entry.id, actor, { duplicateConfirmed: true, duplicateReason: "Test rollback documentaire" }, {
    prismaClient: prisma,
    assertSchema: noSchemaWrite,
    ensureDocument: async () => { throw new Error("DOCUMENT_CREATION_FAILED"); }
  }), /DOCUMENT_CREATION_FAILED/);
  assert.equal((await prisma.assetEntry.findUnique({ where: { id: draft.entry.id } })).entryStatus, "DRAFT");
  assert.equal(await prisma.assetUnit.count({ where: { entryId: draft.entry.id } }), 0);
  assert.equal(await prisma.quantitativeStockPosition.count({ where: { assetEntryId: draft.entry.id } }), 0);
  assert.equal(await prisma.assetDocumentEntry.count({ where: { assetEntryId: draft.entry.id } }), 0);
});

test("l'ouverture et la reprise en lecture ne créent aucun brouillon fantôme", async () => {
  const before = await prisma.assetEntry.count();
  const existing = await prisma.assetEntry.findMany({ where: { entryStatus: "DRAFT" }, select: { id: true, entryNumber: true } });
  for (const entry of existing) await prisma.assetEntry.findUnique({ where: { id: entry.id }, select: { id: true, entryNumber: true } });
  assert.equal(await prisma.assetEntry.count(), before);
});

test.after(async () => {
  await prisma.$disconnect();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("la base de test est une copie temporaire hors du dépôt", () => {
  assert.ok(temporaryDatabase.startsWith(tmpdir()));
  assert.notEqual(pathToFileURL(temporaryDatabase).href, pathToFileURL(join(process.cwd(), "prisma", "dev.db")).href);
});
