import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const feedback = read("app/components/action-feedback.js");
const referentials = read("app/referentiels/reference-manager.js");
const park = read("app/parc/asset-park.js");
const detail = read("app/parc/[id]/asset-unit-detail.js");
const documents = read("app/documents/document-manager.js");
const movements = read("app/mouvements/movement-manager.js");

test("UX-1: le composant commun fournit feedback persistant, détails, CTA et fermeture", () => {
  assert.match(feedback, /success.*error.*info/s);
  assert.match(feedback, /Élément/);
  assert.match(feedback, /Code \/ numéro/);
  assert.match(feedback, /Statut/);
  assert.match(feedback, /action\?\.href/);
  assert.match(feedback, /action\?\.onClick/);
  assert.match(feedback, /onClose/);
  assert.doesNotMatch(feedback, /setTimeout|autoClose/);
});

test("UX-1: Référentiels confirme création, modification et désactivation puis recharge", () => {
  assert.match(referentials, /Création enregistrée/);
  assert.match(referentials, /Modification enregistrée/);
  assert.match(referentials, /Élément désactivé/);
  assert.match(referentials, /code: result\.item\.code/);
  assert.match(referentials, /status: result\.item\.status/);
  assert.ok((referentials.match(/await loadAll\(\)/g) || []).length >= 2);
  assert.match(referentials, /<ActionFeedback feedback=\{message\}/);
});

test("UX-1: Parc couvre entrées, quantitatif, ensembles et fichiers", () => {
  for (const title of ["Entrée quantitative créée", "Entrée individuelle créée", "Transfert quantitatif enregistré", "Individualisation terminée", "Ensemble installé créé", "Composant ajouté", "Ensemble désactivé", "Fichier ajouté", "Photo principale définie", "Fichier supprimé"]) {
    assert.ok(park.includes(title), `feedback absent: ${title}`);
  }
  assert.match(park, /details: \[\{ label: "Quantité"/);
  assert.ok((park.match(/await loadData\(\)/g) || []).length >= 10);
  assert.match(park, /<ActionFeedback feedback=\{message\}/);
});

test("UX-1: la fiche bien confirme fichiers et mises à jour sans reload manuel", () => {
  for (const title of ["Fiche mise à jour", "Fichier ajouté", "Photo principale définie", "Fichier supprimé"]) assert.ok(detail.includes(title));
  assert.ok((detail.match(/await loadData\(\)/g) || []).length >= 4);
  assert.match(detail, /<ActionFeedback feedback=\{message\}/);
});

test("UX-1: Documents confirme brouillon, validation, annulation et rafraîchit", () => {
  for (const title of ["Brouillon créé", "Document validé", "Document annulé"]) assert.ok(documents.includes(title));
  assert.ok((documents.match(/await loadData\(\)/g) || []).length >= 3);
  assert.match(documents, /code: result\.document\.documentNumber/);
  assert.match(documents, /<ActionFeedback feedback=\{message\}/);
});

test("UX-1: Mouvements confirme brouillon, validation, annulation et rafraîchit", () => {
  for (const title of ["Brouillon créé", "Mouvement validé", "Mouvement annulé"]) assert.ok(movements.includes(title));
  assert.ok((movements.match(/await loadData\(\)/g) || []).length >= 3);
  assert.match(movements, /code: result\.movement\.movementNumber/);
  assert.match(movements, /<ActionFeedback feedback=\{message\}/);
});

test("UX-1: les erreurs serveur restent visibles via le composant commun", () => {
  for (const source of [referentials, park, detail, documents, movements]) {
    assert.match(source, /actionError\(result\.error/);
    assert.match(source, /onClose=\{\(\) => setMessage\(""\)\}/);
  }
});
