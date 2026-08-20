import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

const rootUrl = pathToFileURL(`${process.cwd()}\\`).href;
const loader = `export async function resolve(specifier, context, nextResolve) { if (specifier.startsWith('@/')) { let path = specifier.slice(2); if (!/\\.[cm]?js$/.test(path)) path += path.startsWith('generated/') ? '/index.js' : '.js'; return { url: new URL(path, ${JSON.stringify(rootUrl)}).href, shortCircuit: true }; } return nextResolve(specifier, context); }`;
register(`data:text/javascript,${encodeURIComponent(loader)}`);
process.env.APP_DATABASE_PROVIDER = "sqlite";
process.env.DATABASE_URL = "file:./prisma/dev.db";

const { addEquipmentSetComponent, createEquipmentSet, disableEquipmentSet, listEquipmentSets } = await import("../lib/equipment-set-service.js");

function fakeDatabase({ availableQuantity = 8 } = {}) {
  const state = {
    stock: availableQuantity,
    entryQuantity: 8,
    units: [{ id: "unit-1", assetCode: "IMM-1", locationId: "loc-1", status: "IN_SERVICE", deletedAt: null }],
    sets: [],
    components: []
  };
  const tx = {
    location: { async findFirst({ where }) { return where.id === "loc-1" ? { id: "loc-1", status: "ACTIVE" } : null; } },
    equipmentSet: {
      async findFirst({ where }) { return state.sets.find((set) => (where.id ? set.id === where.id : set.code === where.code) && !set.deletedAt) || null; },
      async findMany() { return state.sets.filter((set) => !set.deletedAt && set.status !== "DISABLED"); },
      async create({ data }) { const value = { id: `set-${state.sets.length + 1}`, ...data, deletedAt: null, components: [] }; state.sets.push(value); return value; },
      async update({ where, data }) { const value = state.sets.find((set) => set.id === where.id); Object.assign(value, data); return value; }
    },
    assetUnit: { async findFirst({ where }) { return state.units.find((unit) => unit.id === where.id && !unit.deletedAt) || null; } },
    quantitativeStockPosition: { async findUnique({ where }) { const key = where.assetEntryId_locationId; return key.assetEntryId === "entry-1" && key.locationId === "loc-1" ? { id: "stock-1", availableQuantity: state.stock } : null; } },
    equipmentSetComponent: {
      async findFirst({ where }) { return state.components.find((component) => component.assetUnitId === where.assetUnitId && !component.deletedAt) || null; },
      async aggregate({ where }) { return { _sum: { quantity: state.components.filter((component) => component.assetEntryId === where.assetEntryId && component.sourceLocationId === where.sourceLocationId).reduce((sum, component) => sum + (component.quantity || 0), 0) || null } }; },
      async create({ data }) { const value = { id: `component-${state.components.length + 1}`, ...data, deletedAt: null }; state.components.push(value); return value; }
    }
  };
  return { state, client: { async $transaction(callback) { return callback(tx); }, equipmentSet: tx.equipmentSet } };
}

const actor = { id: "actor-1" };

test("13C-G-C: liste et création d'un ensemble avec emplacement obligatoire", async () => {
  const database = fakeDatabase();
  await assert.rejects(() => createEquipmentSet({ code: "ENS-X", name: "Sans emplacement" }, actor, { prismaClient: database.client }), { code: "INVALID_EQUIPMENT_SET" });
  await createEquipmentSet({ code: "ens-tv", name: "Ensemble TV", locationId: "loc-1" }, actor, { prismaClient: database.client });
  const sets = await listEquipmentSets({}, { prismaClient: database.client });
  assert.equal(sets.length, 1);
  assert.equal(sets[0].code, "ENS-TV");
});

test("13C-G-C: une unité compatible est référencée une seule fois sans mutation patrimoniale", async () => {
  const database = fakeDatabase();
  const set = await createEquipmentSet({ code: "ENS-1", name: "Ensemble", locationId: "loc-1" }, actor, { prismaClient: database.client });
  const before = structuredClone(database.state.units);
  await addEquipmentSetComponent(set.id, { assetUnitId: "unit-1", quantity: 1 }, actor, { prismaClient: database.client });
  assert.deepEqual(database.state.units, before);
  await assert.rejects(() => addEquipmentSetComponent(set.id, { assetUnitId: "unit-1", quantity: 1 }, actor, { prismaClient: database.client }), { code: "ASSET_UNIT_ALREADY_ASSIGNED" });
});

test("13C-G-C: un composant quantitatif cohérent reste descriptif", async () => {
  const database = fakeDatabase();
  const set = await createEquipmentSet({ code: "ENS-2", name: "Ensemble", locationId: "loc-1" }, actor, { prismaClient: database.client });
  await addEquipmentSetComponent(set.id, { assetEntryId: "entry-1", sourceLocationId: "loc-1", quantity: 3 }, actor, { prismaClient: database.client });
  assert.equal(database.state.stock, 8);
  assert.equal(database.state.entryQuantity, 8);
  assert.equal(database.state.units.length, 1);
  for (const quantity of [0, -1]) await assert.rejects(() => addEquipmentSetComponent(set.id, { assetEntryId: "entry-1", sourceLocationId: "loc-1", quantity }, actor, { prismaClient: database.client }), { code: "INVALID_QUANTITATIVE_COMPONENT" });
  await assert.rejects(() => addEquipmentSetComponent(set.id, { assetEntryId: "entry-1", sourceLocationId: "loc-1", quantity: 6 }, actor, { prismaClient: database.client }), { code: "INSUFFICIENT_QUANTITATIVE_STOCK" });
  await assert.rejects(() => addEquipmentSetComponent(set.id, { assetEntryId: "entry-1", sourceLocationId: "loc-2", quantity: 1 }, actor, { prismaClient: database.client }), { code: "LOCATION_MISMATCH" });
});

test("13C-G-C: la désactivation est logique", async () => {
  const database = fakeDatabase();
  const set = await createEquipmentSet({ code: "ENS-3", name: "Ensemble", locationId: "loc-1" }, actor, { prismaClient: database.client });
  await disableEquipmentSet(set.id, actor, { prismaClient: database.client });
  assert.equal(database.state.sets[0].status, "DISABLED");
  assert.ok(database.state.sets[0].deletedAt instanceof Date);
  assert.equal((await listEquipmentSets({}, { prismaClient: database.client })).length, 0);
});

test("13C-G-C: API et interface appliquent lecture/écriture, exposition et E déprécié", () => {
  const collectionRoute = readFileSync("app/api/equipment-sets/route.js", "utf8");
  const itemRoute = readFileSync("app/api/equipment-sets/[id]/route.js", "utf8");
  const componentRoute = readFileSync("app/api/equipment-sets/[id]/components/route.js", "utf8");
  const park = readFileSync("app/parc/asset-park.js", "utf8");
  const assetService = readFileSync("lib/asset-service.js", "utf8");
  const referenceFoundation = readFileSync("lib/asset-reference-foundation.js", "utf8");
  assert.match(collectionRoute, /export async function GET/);
  assert.match(collectionRoute, /POST[\s\S]*APP_PERMISSIONS\.ASSETS_WRITE/);
  assert.match(itemRoute, /DELETE[\s\S]*APP_PERMISSIONS\.ASSETS_WRITE/);
  assert.match(componentRoute, /POST[\s\S]*APP_PERMISSIONS\.ASSETS_WRITE/);
  assert.match(park, /Ensembles installés/);
  assert.match(park, /canWrite \? <div className="park-detail-grid detail-row">/);
  assert.match(park, /ne réserve et ne décrémente pas le stock/);
  assert.match(referenceFoundation, /TRACKING_MODE_NOT_OPERATIONAL/);
  assert.match(assetService, /\["Q", "QI"\]/);
});
