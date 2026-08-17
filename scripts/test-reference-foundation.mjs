import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertIndividualTrackingMode,
  assertNewCategoryCode,
  validateAssetCategoryMutation,
  validateAssetItemFamily
} from "../lib/asset-reference-foundation.js";

function categoryClient(categories = [], items = []) {
  const byId = new Map(categories.map((item) => [item.id, item]));
  return {
    assetCategory: {
      findFirst: async ({ where }) => {
        const item = byId.get(where.id) || null;
        if (!item || item.deletedAt) return null;
        if (where.status && item.status !== where.status) return null;
        return item;
      },
      findUnique: async ({ where }) => byId.get(where.id) || null,
      count: async ({ where }) => categories.filter((item) => item.parentId === where.parentId && !item.deletedAt).length
    },
    assetItem: {
      findFirst: async ({ where }) => items.find((item) => item.id === where.id && !item.deletedAt) || null,
      count: async ({ where }) => items.filter((item) => item.categoryId === where.categoryId && !item.deletedAt).length
    }
  };
}

const root = { id: "cat", hierarchyLevel: "CATEGORY", parentId: null, status: "ACTIVE", code: "CAT-HOTEL" };
const sub = { id: "sub", hierarchyLevel: "SUBCATEGORY", parentId: "cat", status: "ACTIVE", code: "SCT-ROOMS" };
const family = { id: "fam", hierarchyLevel: "FAMILY", parentId: "sub", status: "ACTIVE", code: "FAM-TV", trackingMode: "I", controlLevel: "C2" };

test("création CATEGORY valide", async () => {
  const result = await validateAssetCategoryMutation({
    prismaClient: categoryClient(),
    body: { hierarchyLevel: "CATEGORY", code: "CAT-FOOD" }
  });
  assert.deepEqual(result, { hierarchyLevel: "CATEGORY", parentId: null, trackingMode: null, controlLevel: null, code: "CAT-FOOD" });
});

test("création SUBCATEGORY valide avec CATEGORY", async () => {
  const result = await validateAssetCategoryMutation({
    prismaClient: categoryClient([root]),
    body: { hierarchyLevel: "SUBCATEGORY", parentId: "cat", code: "SCT-TABLE" }
  });
  assert.equal(result.parentId, "cat");
});

test("création FAMILY valide avec mode et contrôle", async () => {
  const result = await validateAssetCategoryMutation({
    prismaClient: categoryClient([root, sub]),
    body: { hierarchyLevel: "FAMILY", parentId: "sub", code: "FAM-SPOON", trackingMode: "Q", controlLevel: "C1" }
  });
  assert.equal(result.trackingMode, "Q");
  assert.equal(result.controlLevel, "C1");
});

test("SUBCATEGORY sans CATEGORY est refusée", async () => {
  await assert.rejects(() => validateAssetCategoryMutation({
    prismaClient: categoryClient(), body: { hierarchyLevel: "SUBCATEGORY", code: "SCT-X" }
  }), /catégorie comme parent/i);
});

test("FAMILY sans SUBCATEGORY est refusée", async () => {
  await assert.rejects(() => validateAssetCategoryMutation({
    prismaClient: categoryClient(), body: { hierarchyLevel: "FAMILY", code: "FAM-X", trackingMode: "I", controlLevel: "C1" }
  }), /sous-catégorie comme parent/i);
});

test("FAMILY directement sous CATEGORY est refusée", async () => {
  await assert.rejects(() => validateAssetCategoryMutation({
    prismaClient: categoryClient([root]), body: { hierarchyLevel: "FAMILY", parentId: "cat", code: "FAM-X", trackingMode: "I", controlLevel: "C1" }
  }), /sous-catégorie comme parent/i);
});

test("mauvais parent et cycle sont refusés", async () => {
  await assert.rejects(() => validateAssetCategoryMutation({
    prismaClient: categoryClient([root, sub]),
    id: "cat",
    body: { hierarchyLevel: "CATEGORY", parentId: "sub", code: "CAT-HOTEL" }
  }), /ne peut pas avoir de parent|cycle/i);
});

test("trackingMode invalide est refusé", async () => {
  await assert.rejects(() => validateAssetCategoryMutation({
    prismaClient: categoryClient([root, sub]),
    body: { hierarchyLevel: "FAMILY", parentId: "sub", code: "FAM-X", trackingMode: "AUTO", controlLevel: "C1" }
  }), /mode de suivi invalide/i);
});

test("controlLevel invalide est refusé", async () => {
  await assert.rejects(() => validateAssetCategoryMutation({
    prismaClient: categoryClient([root, sub]),
    body: { hierarchyLevel: "FAMILY", parentId: "sub", code: "FAM-X", trackingMode: "I", controlLevel: "C9" }
  }), /niveau de contrôle invalide/i);
});

test("les préfixes stables sont obligatoires pour les nouveaux codes", () => {
  assert.equal(assertNewCategoryCode("fam-tv", "FAMILY"), "FAM-TV");
  assert.throws(() => assertNewCategoryCode("CAT-TV", "FAMILY"), /FAM-/);
});

test("une nouvelle Référence matériel doit cibler une FAMILY", async () => {
  const prismaClient = categoryClient([root, sub, family]);
  assert.deepEqual(await validateAssetItemFamily({ prismaClient, body: { categoryId: "fam" } }), { categoryId: "fam" });
  await assert.rejects(() => validateAssetItemFamily({ prismaClient, body: { categoryId: "cat" } }), /famille active/i);
});

test("le mode I conserve le chemin individuel", () => {
  assert.equal(assertIndividualTrackingMode({ category: { trackingMode: "I" } }), "I");
});

for (const mode of ["Q", "QI", "E"]) {
  test(`le mode ${mode} bloque la création d'AssetUnit avant 13C`, () => {
    assert.throws(
      () => assertIndividualTrackingMode({ category: { trackingMode: mode } }),
      (error) => error.code === "TRACKING_MODE_NOT_OPERATIONAL" && error.status === 409
    );
  });
}

test("les migrations sont additives et Production reste non exécutée par les scripts", async () => {
  const files = [
    "prisma/migrations/20260817090000_add_reference_foundation/migration.sql",
    "prisma/postgresql/migrations/20260817090000_add_reference_foundation/migration.sql",
    "prisma/postgresql-recipe/migrations/20260817090000_add_reference_foundation/migration.sql"
  ];
  for (const file of files) {
    const sql = await readFile(file, "utf8");
    assert.doesNotMatch(sql, /\b(DROP|DELETE|TRUNCATE)\b/i);
    assert.match(sql, /hierarchy_level/);
    assert.match(sql, /tracking_mode/);
    assert.match(sql, /control_level/);
  }
});

test("l'API et l'interface exposent les trois concepts", async () => {
  const sources = await Promise.all([
    readFile("app/api/asset-categories/route.js", "utf8"),
    readFile("app/referentiels/reference-manager.js", "utf8"),
    readFile("app/referentiels/page.js", "utf8")
  ]);
  const text = sources.join("\n");
  assert.match(text, /hierarchyLevel/);
  assert.match(text, /trackingMode/);
  assert.match(text, /controlLevel/);
  assert.match(text, /Références matériel/);
});

test("/referentiels sépare les sélections Location et AssetCategory", async () => {
  const page = await readFile("app/referentiels/page.js", "utf8");
  const locationStart = page.indexOf("prisma.location.findMany(");
  const categoryStart = page.indexOf("prisma.assetCategory.findMany(");
  assert.ok(locationStart >= 0 && categoryStart > locationStart);
  const locationQuery = page.slice(locationStart, categoryStart);
  assert.match(locationQuery, /parent: \{ select: \{ id: true, name: true, code: true \} \}/);
  assert.doesNotMatch(locationQuery, /hierarchyLevel/);
  assert.match(page, /category: \{ select: \{ id: true, name: true, code: true, hierarchyLevel: true, trackingMode: true, controlLevel: true \} \}/);
});

test("les permissions Référentiels restent inchangées", async () => {
  const authorization = await readFile("lib/authorization.js", "utf8");
  const roles = await readFile("lib/roles.js", "utf8");
  assert.match(authorization, /INVENTORY_MANAGER[\s\S]*APP_PERMISSIONS\.REFERENTIALS_WRITE/);
  assert.doesNotMatch(authorization, /MAINTENANCE_MANAGER[\s\S]{0,300}APP_PERMISSIONS\.REFERENTIALS_WRITE/);
  assert.match(roles, /canManageReferentials[\s\S]*DIRECTION[\s\S]*INVENTORY_MANAGER/);
});
