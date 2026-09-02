import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [parkPage, parkUi, pickerPage, picker, drafts, dashboard, wizard, entriesRoute, draftRoute, itemsRoute, stepper] = await Promise.all([
  read("app/parc/page.js"), read("app/parc/asset-park.js"), read("app/parc/nouvelle-entree/page.js"),
  read("app/parc/nouvelle-entree/entry-article-picker.js"), read("app/parc/entrees-en-cours/page.js"),
  read("app/parc/entries/[id]/page.js"), read("app/parc/entries/[id]/entry-wizard.js"), read("app/api/asset-entries/route.js"), read("app/api/asset-entries/drafts/route.js"), read("app/api/asset-items/route.js"), read("app/parc/entry-workflow-stepper.js")
]);

test("le parc devient une page d'orientation sans formulaire permanent", () => {
  assert.match(parkPage, /Nouvelle entrée/);
  assert.match(stepper, /Entrées en cours/);
  assert.match(parkUi, /Voir les biens/);
  assert.match(parkUi, /false && canWrite/);
  assert.match(parkUi, /Filtrer par famille \/ catégorie/);
});

test("les fonctions secondaires du parc restent accessibles et repliées", () => {
  assert.match(parkUi, /park-secondary-section[\s\S]*Stocks quantitatifs/);
  assert.match(parkUi, /park-secondary-section[\s\S]*Ensembles installés/);
  assert.match(parkUi, /Ouvrir la fiche/);
});

test("ouvrir le sélecteur ne crée aucun brouillon", () => {
  assert.doesNotMatch(pickerPage, /createAssetEntryDraft|assetEntry\.create/);
  assert.doesNotMatch(picker.slice(0, picker.indexOf("async function startDraft")), /asset-entries\/drafts/);
  assert.match(picker, /startDraft/);
});

test("la recherche porte sur les colonnes légères existantes", () => {
  assert.doesNotMatch(pickerPage, /assetItem\.findMany/);
  assert.match(itemsRoute, /select: \{ id: true, code: true, name: true/);
  assert.match(itemsRoute, /name:[\s\S]*code:[\s\S]*category:/);
  assert.match(picker, /modeLabels/);
});

test("la sélection confirmée crée exactement un brouillon puis conserve son id", () => {
  assert.equal((picker.match(/fetch\("\/api\/asset-entries\/drafts"/g) || []).length, 1);
  assert.match(picker, /router\.push\(`\/parc\/entries\/\$\{result\.entry\.id\}/);
  assert.match(draftRoute, /createAssetEntryDraft/);
});

test("les entrées en cours ne contiennent que les DRAFT et exposent Continuer", () => {
  assert.match(drafts, /where: \{ entryStatus: "DRAFT" \}/);
  assert.match(drafts, /take: 100/);
  assert.match(drafts, /computeAssetEntryProgress/);
  assert.match(drafts, />Continuer</);
});

test("la reprise charge le même id sans nouvelle création", () => {
  assert.match(dashboard, /findUnique\(\{ where: \{ id \}/);
  assert.doesNotMatch(dashboard, /assetEntry\.create|createAssetEntryDraft/);
  assert.match(wizard, /Entrées en cours/);
});

test("l'API de liste fournit la progression calculée", () => {
  assert.match(entriesRoute, /computeAssetEntryProgress/);
  assert.match(entriesRoute, /entryStatus/);
});

test("le parcours annonce explicitement l'absence d'effet patrimonial", () => {
  assert.match(picker, /aucun bien ni stock n’est créé/i);
  assert.match(wizard, /aucun effet patrimonial n’a été produit/i);
});
