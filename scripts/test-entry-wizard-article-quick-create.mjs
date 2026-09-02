import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { validateAssetItemFamily } from "../lib/asset-reference-foundation.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [page, picker, itemRoute, categoryRoute, referenceApi, authorization, roles, foundation] = await Promise.all([
  read("app/parc/nouvelle-entree/page.js"),
  read("app/parc/nouvelle-entree/entry-article-picker.js"),
  read("app/api/asset-items/route.js"),
  read("app/api/asset-categories/route.js"),
  read("lib/reference-api.js"),
  read("lib/authorization.js"),
  read("lib/roles.js"),
  read("lib/asset-reference-foundation.js")
]);

const familyClient = (family) => ({
  assetCategory: { findFirst: async () => family },
  assetItem: { findFirst: async () => null }
});

test("DIRECTION reçoit le droit de création référentielle", () => {
  assert.match(authorization, /DIRECTION:[\s\S]*Object\.values\(APP_PERMISSIONS\)/);
  assert.match(page, /canCreateArticle=\{hasPermission\(access\.user, APP_PERMISSIONS\.REFERENTIALS_WRITE\)\}/);
});
test("INVENTORY_MANAGER reçoit le droit de création référentielle", () => assert.match(authorization, /INVENTORY_MANAGER:[\s\S]*APP_PERMISSIONS\.REFERENTIALS_WRITE/));
test("MAINTENANCE_MANAGER ne reçoit pas le droit de création référentielle", () => assert.doesNotMatch(authorization.match(/MAINTENANCE_MANAGER:[\s\S]*?BASIC_USER:/)?.[0] || "", /REFERENTIALS_WRITE/));
test("BASIC_USER ne reçoit pas le droit de création référentielle", () => assert.doesNotMatch(authorization.match(/BASIC_USER:[\s\S]*?\n\s*}\)/)?.[0] || "", /REFERENTIALS_WRITE/));
test("le serveur refuse tout rôle non gestionnaire", () => {
  assert.match(referenceApi, /!canManageReferentials\(actor\.role\)/);
  assert.match(roles, /role === USER_ROLES\.DIRECTION \|\| role === USER_ROLES\.INVENTORY_MANAGER/);
});
test("le bouton est rendu uniquement avec l’autorisation transmise", () => assert.match(picker, /\{canCreateArticle \? [\s\S]*Créer un nouvel article/));
test("la création exige une famille existante", async () => {
  const data = await validateAssetItemFamily({ prismaClient: familyClient({ id: "fam", hierarchyLevel: "FAMILY", trackingMode: "I", controlLevel: "C1" }), body: { name: "Chaise", code: "ART-CHAIR", categoryId: "fam" } });
  assert.equal(data.categoryId, "fam");
});
test("le nom est obligatoire", () => assert.match(itemRoute, /required: \["name", "code", "categoryId"\]/));
test("le code référence est obligatoire", () => assert.match(itemRoute, /required: \["name", "code", "categoryId"\]/));
test("la famille est obligatoire", async () => await assert.rejects(() => validateAssetItemFamily({ prismaClient: familyClient(null), body: { name: "Chaise", code: "ART-CHAIR" } }), /famille est obligatoire/i));
test("une famille inactive est refusée par la validation", async () => await assert.rejects(() => validateAssetItemFamily({ prismaClient: familyClient(null), body: { name: "Chaise", code: "ART-CHAIR", categoryId: "inactive" } }), /famille active/i));
test("la liste rapide ne retourne que les familles actives", () => assert.match(categoryRoute, /hierarchyLevel: "FAMILY", status: "ACTIVE", deletedAt: null/));
test("la vérification applicative refuse un code déjà actif", () => assert.match(foundation, /Ce code de référence est déjà utilisé/));
test("une collision Prisma P2002 retourne HTTP 409", () => {
  assert.match(referenceApi, /error\?\.code === "P2002"/);
  assert.match(referenceApi, /jsonError\(uniqueConflictMessage, 409\)/);
});
test("la réponse POST contient la famille et le mode de suivi", () => assert.match(itemRoute, /returnInclude:[\s\S]*category:[\s\S]*trackingMode: true/));
test("l’article créé est inséré localement et sélectionné", () => {
  assert.match(picker, /setResults\(\(current\) => \[item,/);
  assert.match(picker, /setSelected\(item\)/);
});
test("la création ne recharge pas la page ni tout le référentiel", () => {
  const handler = picker.match(/async function createAndSelectArticle[\s\S]*?\n  }/)?.[0] || "";
  assert.doesNotMatch(handler, /router\.refresh|window\.location|loadData/);
});
test("la création rapide ne crée aucun brouillon fantôme", () => {
  const handler = picker.match(/async function createAndSelectArticle[\s\S]*?\n  }/)?.[0] || "";
  assert.doesNotMatch(handler, /asset-entries|startDraft/);
  assert.match(handler, /fetch\("\/api\/asset-items"/);
});
test("la création rapide n’appelle aucun service patrimonial", () => {
  const handler = picker.match(/async function createAndSelectArticle[\s\S]*?\n  }/)?.[0] || "";
  assert.doesNotMatch(handler, /asset-units|quantitative|movement|ENTRY_SLIP|documents/);
});
test("le workflow normal reste disponible après sélection", () => {
  assert.match(picker, /async function startDraft\(\)/);
  assert.match(picker, /disabled=\{busy \|\| !selected \|\| !locationId\}/);
});
test("I Q QI sont dérivés de la famille", () => {
  assert.match(categoryRoute, /trackingMode: \{ in: \["I", "Q", "QI"\] \}/);
  assert.match(picker, /mode de suivi I, Q ou QI sera repris automatiquement depuis la famille/);
});
test("la recherche serveur B2 reste bornée et temporisée", () => {
  assert.match(picker, /picker: "true", limit: "20"/);
  assert.ok((picker.match(/}, 250\)/g) || []).length >= 2);
  assert.match(itemRoute, /take: limit/);
  assert.match(categoryRoute, /Math\.min\(requestedLimit, 50\)/);
});
test("création et audit AssetItem sont atomiques", () => {
  assert.match(itemRoute, /transactionalAudit: true/);
  assert.match(referenceApi, /prisma\.\$transaction\(createItem\)/);
  assert.match(referenceApi, /client\.auditLog\.create/);
});
