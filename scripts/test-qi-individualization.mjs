import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

const rootUrl = pathToFileURL(`${process.cwd()}\\`).href;
const loader = `export async function resolve(specifier, context, nextResolve) { if (specifier.startsWith('@/')) { let path = specifier.slice(2); if (!/\\.[cm]?js$/.test(path)) path += path.startsWith('generated/') ? '/index.js' : '.js'; return { url: new URL(path, ${JSON.stringify(rootUrl)}).href, shortCircuit: true }; } return nextResolve(specifier, context); }`;
register(`data:text/javascript,${encodeURIComponent(loader)}`);
process.env.APP_DATABASE_PROVIDER = "sqlite";
process.env.DATABASE_URL = "file:./prisma/dev.db";

const { individualizeQuantitativeStock } = await import("../lib/quantitative-individualization-service.js");
const assetServiceSource = await readFile(new URL("../lib/asset-service.js", import.meta.url), "utf8");
const documentServiceSource = await readFile(new URL("../lib/document-service.js", import.meta.url), "utf8");

function fakeDatabase({ trackingMode = "QI", stock = 20, conditionalFailure = false } = {}) {
  const state = { stock, units: [], audits: [], entryQuantity: 20, documents: 0 };
  const client = { async $transaction(callback) { const snapshot = structuredClone(state); try { return await callback(tx); } catch (error) { Object.assign(state, snapshot); throw error; } } };
  const tx = {
    assetEntry: { async findUnique() { return { id: "entry-qi", entryNumber: "ENT-QI", assetItemId: "item-qi", locationId: "location-1", supplierId: null, quantity: state.entryQuantity, entryDate: new Date("2026-08-20"), initialCondition: "GOOD", initialStatus: "IN_SERVICE", informationStatus: "PARTIAL", purchaseDate: null, purchaseDateKnown: false, unitPrice: null, priceKnown: false, supplierKnown: false, invoiceAvailable: false, invoiceReference: null, notes: null, assetItem: { id: "item-qi", code: "CHAIR-QI", status: "ACTIVE", deletedAt: null, category: { hierarchyLevel: "FAMILY", trackingMode, status: "ACTIVE", deletedAt: null } } }; } },
    location: { async findFirst() { return { id: "location-1" }; } },
    quantitativeStockPosition: {
      async findUnique() { return { id: "position-1", assetEntryId: "entry-qi", locationId: "location-1", availableQuantity: state.stock }; },
      async updateMany({ where, data }) { if (conditionalFailure || state.stock < where.availableQuantity.gte) return { count: 0 }; state.stock -= data.availableQuantity.decrement; return { count: 1 }; }
    },
    assetUnit: {
      async findMany({ where } = {}) {
        if (where?.assetCode?.startsWith) return state.units.map(({ assetCode }) => ({ assetCode }));
        if (where?.assetCode?.in) return state.units.filter((unit) => where.assetCode.in.includes(unit.assetCode));
        return state.units;
      },
      async createMany({ data }) { state.units.push(...data.map((unit, index) => ({ id: `unit-${state.units.length + index + 1}`, ...unit }))); return { count: data.length }; }
    },
    auditLog: { async createMany({ data }) { state.audits.push(...data); return { count: data.length }; } }
  };
  return { client, state };
}

const actor = { id: "actor-1" };
const body = { assetEntryId: "entry-qi", locationId: "location-1", quantity: 2 };

test("13C-F: l'entrée QI réutilise le socle quantitatif et ne crée aucune unité automatiquement", () => {
  assert.match(assetServiceSource, /\["Q", "QI"\]\.includes/);
  assert.match(assetServiceSource, /units: \[\], duplicateWarning: null, trackingMode/);
  assert.match(documentServiceSource, /\["Q", "QI"\]\.includes/);
});

test("13C-F: individualiser 2 sur 20 crée deux unités rattachées au lot et au bon emplacement", async () => {
  const database = fakeDatabase();
  const result = await individualizeQuantitativeStock(body, actor, { prismaClient: database.client });
  assert.equal(database.state.stock, 18); assert.equal(result.units.length, 2);
  assert.ok(result.units.every((unit) => unit.entryId === "entry-qi" && unit.locationId === "location-1"));
  assert.equal(new Set(result.units.map((unit) => unit.assetCode)).size, 2);
  assert.equal(database.state.stock + database.state.units.length, database.state.entryQuantity);
  assert.equal(database.state.documents, 0);
});

test("13C-F: l'individualisation totale conserve la position à zéro", async () => {
  const database = fakeDatabase();
  await individualizeQuantitativeStock({ ...body, quantity: 20 }, actor, { prismaClient: database.client });
  assert.equal(database.state.stock, 0); assert.equal(database.state.units.length, 20);
});

test("13C-F: quantités invalides, stock insuffisant et concurrence sont refusés", async () => {
  for (const quantity of [0, -1, 1.5, "2.5"]) await assert.rejects(() => individualizeQuantitativeStock({ ...body, quantity }, actor, { prismaClient: fakeDatabase().client }), /entier strictement positif/);
  await assert.rejects(() => individualizeQuantitativeStock({ ...body, quantity: 21 }, actor, { prismaClient: fakeDatabase().client }), { code: "INSUFFICIENT_STOCK" });
  await assert.rejects(() => individualizeQuantitativeStock(body, actor, { prismaClient: fakeDatabase({ conditionalFailure: true }).client }), { code: "INSUFFICIENT_STOCK" });
});

test("13C-F: Q, I et E sont interdits au service QI", async () => {
  for (const trackingMode of ["Q", "I", "E"]) await assert.rejects(() => individualizeQuantitativeStock(body, actor, { prismaClient: fakeDatabase({ trackingMode }).client }), { code: "TRACKING_MODE_NOT_OPERATIONAL" });
});

test("13C-F: un échec de création d'unité annule le décrément et toutes les unités", async () => {
  const database = fakeDatabase();
  await assert.rejects(() => individualizeQuantitativeStock(body, actor, { prismaClient: database.client, beforeUnitsCreate: async () => { throw new Error("injected unit failure"); } }), /injected/);
  assert.equal(database.state.stock, 20); assert.equal(database.state.units.length, 0); assert.equal(database.state.audits.length, 0);
});
