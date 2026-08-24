import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [page, wizard, itemRoute, validateRoute, fileRoute, fileItemRoute, service, drafts, park] = await Promise.all([
  read("app/parc/entries/[id]/page.js"), read("app/parc/entries/[id]/entry-wizard.js"), read("app/api/asset-entries/[id]/route.js"),
  read("app/api/asset-entries/[id]/validate/route.js"), read("app/api/asset-entries/[id]/files/route.js"), read("app/api/asset-entries/[id]/files/[fileId]/route.js"),
  read("lib/asset-service.js"), read("app/parc/entrees-en-cours/page.js"), read("app/parc/asset-park.js")
]);

test("la route stable charge un seul brouillon par id", () => { assert.match(page, /findUnique\(\{ where: \{ id \}/); assert.doesNotMatch(page, /assetEntry\.create/); });
test("entry_id et entryNumber restent stables dans la navigation", () => { assert.match(wizard, /\/parc\/entries\/\$\{entry\.id\}\?step=/); assert.match(wizard, /entry\.entryNumber/); });
test("la progression UX n'ajoute aucun statut DB", () => { assert.match(wizard, /Fiche d’entrée/); assert.match(wizard, /Photos & documents/); assert.doesNotMatch(wizard, /entry_steps|READY_TO_VALIDATE/); });
test("les étapes détails et finances sauvegardent le même DRAFT", () => { assert.equal((wizard.match(/method: "PATCH"/g) || []).length >= 2, true); assert.match(itemRoute, /updateAssetEntryDraft/); });
test("enregistrer et quitter conserve le brouillon", () => { assert.match(wizard, /saveDraft\(\{ leave: true \}\)/); assert.match(wizard, /\/parc\/entrees-en-cours/); });
test("la reprise et le refresh ne créent pas une nouvelle entrée", () => { assert.doesNotMatch(page + wizard, /createAssetEntryDraft|\/api\/asset-entries\/drafts/); });
test("les champs identification et affectation sont ceux du modèle actuel", () => { for (const value of ["quantity", "entryType", "entryDate", "locationId", "initialCondition", "initialStatus", "informationStatus"]) assert.match(wizard, new RegExp(value)); });
test("I Q et QI restent déterminés par la famille", () => { assert.match(wizard, /assetItem\.category\?\.trackingMode/); assert.match(validateRoute, /validateAssetEntryDraft/); });
test("les photos du brouillon sont isolées par l'API d'entrée", () => { assert.match(fileRoute, /assetEntryId: id/); assert.match(wizard, /MATERIAL_PHOTO/); });
test("les documents du brouillon utilisent le système existant", () => { assert.match(wizard, /SUPPORTING_DOCUMENT/); assert.match(fileRoute, /saveAssetEntryFileFromForm/); });
test("photo principale et suppression logique restent disponibles", () => { assert.match(wizard, /isPrimary: true/); assert.match(fileItemRoute, /deleteAssetFile/); });
test("les finances réellement supportées sont sauvegardables et facultatives", () => { for (const value of ["supplierKnown", "purchaseDateKnown", "priceKnown", "invoiceAvailable"]) assert.match(wizard, new RegExp(value)); assert.doesNotMatch(wizard, /currency|warrantyEndDate|acquisitionMode/); });
test("la vérification reflète le formulaire et permet de modifier", () => { assert.match(wizard, /function Review/); assert.match(wizard, /navigate\("details"\)/); assert.match(wizard, /navigate\("files"\)/); });
test("la validation finale appelle exclusivement le moteur B", () => { assert.match(wizard, /\/validate/); assert.match(validateRoute, /validateAssetEntryDraft/); assert.match(service, /prismaClient\.\$transaction/); });
test("le bouton final est protégé contre le double clic", () => { assert.match(wizard, /disabled=\{busy \|\| !canWrite \|\| !progress\.readyToValidate\}/); assert.match(wizard, /Validation en cours/); });
test("la confirmation utilise les identifiants patrimoniaux réels", () => { assert.match(wizard, /assetUnits/); assert.match(wizard, /assetCode/); assert.match(wizard, /quantitativeStockPositions/); });
test("une entrée validée n'est plus éditable ni listée en cours", () => { assert.match(wizard, /entry\.entryStatus === "VALIDATED" \? "confirmation"/); assert.match(drafts, /entryStatus: "DRAFT"/); assert.match(itemRoute, /updateAssetEntryDraft/); });
test("le parc et ses fonctions secondaires restent présents", () => { assert.match(park, /Voir les biens/); assert.match(park, /Stocks quantitatifs/); assert.match(park, /Ensembles installés/); });
