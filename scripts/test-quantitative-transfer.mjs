import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

const rootUrl = pathToFileURL(`${process.cwd()}\\`).href;
const loader = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    let path = specifier.slice(2);
    if (!/\\.[cm]?js$/.test(path)) path += path.startsWith('generated/') ? '/index.js' : '.js';
    return { url: new URL(path, ${JSON.stringify(rootUrl)}).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(loader)}`);
process.env.APP_DATABASE_PROVIDER = "sqlite";
process.env.DATABASE_URL = "file:./prisma/dev.db";

const { transferQuantitativeStock } = await import("../lib/quantitative-transfer-service.js");

function fakeDatabase({ trackingMode = "Q", sourceQuantity = 120, destinationQuantity = null, forceConditionalFailure = false } = {}) {
  const initial = new Map([["entry-1:source", { id: "source-position", assetEntryId: "entry-1", locationId: "source", availableQuantity: sourceQuantity }]]);
  if (destinationQuantity !== null) initial.set("entry-1:destination", { id: "destination-position", assetEntryId: "entry-1", locationId: "destination", availableQuantity: destinationQuantity });
  const state = { positions: initial, movements: [], lines: [], audits: [], units: 0, entryQuantity: 120 };

  const client = {
    async $transaction(callback) {
      const snapshot = structuredClone(state);
      try { return await callback(tx); } catch (error) { Object.assign(state, snapshot); throw error; }
    }
  };
  const tx = {
    assetEntry: { async findUnique() { return { id: "entry-1", quantity: state.entryQuantity, assetItem: { status: "ACTIVE", deletedAt: null, category: { hierarchyLevel: "FAMILY", trackingMode, status: "ACTIVE", deletedAt: null } } }; } },
    location: { async count() { return 2; } },
    quantitativeStockPosition: {
      async findUnique({ where }) { const key = `${where.assetEntryId_locationId.assetEntryId}:${where.assetEntryId_locationId.locationId}`; return state.positions.get(key) || null; },
      async updateMany({ where, data }) {
        const position = [...state.positions.values()].find((item) => item.id === where.id);
        if (forceConditionalFailure || !position || position.availableQuantity < where.availableQuantity.gte) return { count: 0 };
        position.availableQuantity -= data.availableQuantity.decrement;
        return { count: 1 };
      },
      async upsert({ where, create, update }) {
        const key = `${where.assetEntryId_locationId.assetEntryId}:${where.assetEntryId_locationId.locationId}`;
        const current = state.positions.get(key);
        if (current) current.availableQuantity += update.availableQuantity.increment;
        else state.positions.set(key, { id: "destination-created", ...create });
        return state.positions.get(key);
      }
    },
    assetMovement: {
      async findMany() { return []; },
      async create({ data }) {
        const movement = { id: `movement-${state.movements.length + 1}`, ...data, quantitativeLines: [{ id: "line-1", ...data.quantitativeLines.create }] };
        state.movements.push(movement); state.lines.push(...movement.quantitativeLines); return movement;
      }
    },
    auditLog: { async createMany({ data }) { state.audits.push(...data); return { count: data.length }; } }
  };
  return { client, state };
}

const actor = { id: "actor-1" };
const body = { assetEntryId: "entry-1", fromLocationId: "source", toLocationId: "destination", quantity: 30, reason: "Test" };

test("13C-E: 30 sur 120 crée la destination, conserve le total et ne crée aucune unité", async () => {
  const { client, state } = fakeDatabase();
  const result = await transferQuantitativeStock(body, actor, { prismaClient: client });
  assert.equal(state.positions.get("entry-1:source").availableQuantity, 90);
  assert.equal(state.positions.get("entry-1:destination").availableQuantity, 30);
  assert.equal([...state.positions.values()].reduce((sum, item) => sum + item.availableQuantity, 0), 120);
  assert.equal(state.entryQuantity, 120); assert.equal(state.units, 0);
  assert.equal(result.movement.quantitativeLines.length, 1); assert.equal(state.lines.length, 1);
});

test("13C-E: une destination existante est incrémentée et un transfert total conserve la source à zéro", async () => {
  const existing = fakeDatabase({ sourceQuantity: 90, destinationQuantity: 30 });
  await transferQuantitativeStock({ ...body, quantity: 10 }, actor, { prismaClient: existing.client });
  assert.equal(existing.state.positions.get("entry-1:destination").availableQuantity, 40);
  const total = fakeDatabase({ sourceQuantity: 120 });
  await transferQuantitativeStock({ ...body, quantity: 120 }, actor, { prismaClient: total.client });
  assert.equal(total.state.positions.get("entry-1:source").availableQuantity, 0);
});

test("13C-E: quantités invalides et source égale destination sont refusées", async () => {
  for (const quantity of [0, -1, 1.5, "2.5"]) {
    await assert.rejects(() => transferQuantitativeStock({ ...body, quantity }, actor, { prismaClient: fakeDatabase().client }), /entier strictement positif/);
  }
  await assert.rejects(() => transferQuantitativeStock({ ...body, toLocationId: "source" }, actor, { prismaClient: fakeDatabase().client }), /différente/);
});

test("13C-E: stock insuffisant et échec concurrent sont refusés par le décrément conditionnel", async () => {
  await assert.rejects(() => transferQuantitativeStock({ ...body, quantity: 121 }, actor, { prismaClient: fakeDatabase().client }), { code: "INSUFFICIENT_STOCK" });
  await assert.rejects(() => transferQuantitativeStock(body, actor, { prismaClient: fakeDatabase({ forceConditionalFailure: true }).client }), { code: "INSUFFICIENT_STOCK" });
});

test("13C-E: QI et E restent bloqués", async () => {
  for (const trackingMode of ["QI", "E"]) {
    await assert.rejects(() => transferQuantitativeStock(body, actor, { prismaClient: fakeDatabase({ trackingMode }).client }), { code: "TRACKING_MODE_NOT_OPERATIONAL" });
  }
});

test("13C-E: un échec avant création du mouvement annule toutes les positions", async () => {
  const database = fakeDatabase();
  await assert.rejects(() => transferQuantitativeStock(body, actor, { prismaClient: database.client, beforeMovementCreate: async () => { throw new Error("injected movement failure"); } }), /injected/);
  assert.equal(database.state.positions.get("entry-1:source").availableQuantity, 120);
  assert.equal(database.state.positions.has("entry-1:destination"), false);
  assert.equal(database.state.movements.length, 0); assert.equal(database.state.lines.length, 0);
});
