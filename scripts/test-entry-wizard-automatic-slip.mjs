import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const documentService = readFileSync("lib/document-service.js", "utf8");
const assetService = readFileSync("lib/asset-service.js", "utf8");
const wizard = readFileSync("app/parc/entries/[id]/entry-wizard.js", "utf8");
const documentsPage = readFileSync("app/documents/page.js", "utf8");
const documentValidation = readFileSync("app/api/asset-documents/[id]/validate/route.js", "utf8");

test("le bon automatique réutilise ENTRY_SLIP, DRAFT et la numérotation existante", () => {
  assert.match(documentService, /ensureEntryDraftDocument/);
  assert.match(documentService, /generateDocumentNumber\(tx, "ENTRY_SLIP"/);
  assert.match(documentService, /documentType: "ENTRY_SLIP"/);
  assert.match(documentService, /status: "DRAFT"/);
});

test("la validation patrimoniale et le bon sont dans la même transaction", () => {
  const validation = assetService.slice(assetService.indexOf("export async function validateAssetEntryDraft"));
  assert.match(validation, /prismaClient\.\$transaction/);
  assert.match(validation, /ensureDocument\(tx, id, actor\)/);
  assert.match(validation, /entrySlip: entrySlipResult\.document/);
});

test("l'idempotence recherche le lien existant et utilise un identifiant déterministe", () => {
  assert.match(documentService, /entries: \{ some: \{ assetEntryId: entryId \} \}/);
  assert.match(documentService, /auto-entry-slip-\$\{entry\.id\}/);
  assert.match(documentService, /created: false/);
});

test("la validation documentaire ne rejoue aucun moteur patrimonial", () => {
  assert.doesNotMatch(documentValidation, /assetUnit\.(create|createMany)/);
  assert.doesNotMatch(documentValidation, /quantitativeStockPosition\.(create|update|upsert)/);
  assert.match(documentValidation, /status: "VALIDATED"/);
});

test("la confirmation affiche le bon brouillon et ouvre le document ciblé", () => {
  assert.match(wizard, /Bon d’entrée généré/);
  assert.match(wizard, /Statut : Brouillon/);
  assert.match(wizard, /\/documents\?documentId=\$\{entrySlip\.id\}/);
  assert.match(documentsPage, /initialSelectedDocumentId=\{query\?\.documentId \|\| null\}/);
});
