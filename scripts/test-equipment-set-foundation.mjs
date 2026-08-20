import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { register } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const rootUrl = pathToFileURL(`${process.cwd()}\\`).href;
const loader = `export async function resolve(specifier, context, nextResolve) { if (specifier.startsWith('@/')) { let path = specifier.slice(2); if (!/\\.[cm]?js$/.test(path)) path += path.startsWith('generated/') ? '/index.js' : '.js'; return { url: new URL(path, ${JSON.stringify(rootUrl)}).href, shortCircuit: true }; } return nextResolve(specifier, context); }`;
register(`data:text/javascript,${encodeURIComponent(loader)}`);
process.env.APP_DATABASE_PROVIDER = "sqlite";
process.env.DATABASE_URL = "file:./prisma/dev.db";

const {
  addEquipmentSetComponent,
  createEquipmentSet,
  disableEquipmentSet,
  validateEquipmentComponentShape
} = await import("../lib/equipment-set-service.js");

function fakeDatabase({ availableQuantity = 10 } = {}) {
  const state = { unit: { id: "unit-1", locationId: "loc-1", status: "IN_SERVICE", deletedAt: null }, position: { availableQuantity }, components: [], sets: [], stock: availableQuantity };
  const tx = {
    location: { async findFirst({ where }) { return where.id === "loc-1" ? { id: "loc-1" } : null; } },
    equipmentSet: {
      async findFirst({ where }) { return state.sets.find((set) => (where.id ? set.id === where.id : set.code === where.code) && !set.deletedAt) || null; },
      async create({ data }) { const value = { id: `set-${state.sets.length + 1}`, ...data, deletedAt: null }; state.sets.push(value); return value; },
      async update({ where, data }) { const value = state.sets.find((set) => set.id === where.id); Object.assign(value, data); return value; }
    },
    assetUnit: { async findFirst({ where }) { return where.id === state.unit.id ? state.unit : null; } },
    quantitativeStockPosition: { async findUnique({ where }) { const key = where.assetEntryId_locationId; return key.assetEntryId === "entry-1" && key.locationId === "loc-1" ? { id: "position-1", ...state.position } : null; } },
    equipmentSetComponent: {
      async findFirst({ where }) { return state.components.find((component) => component.assetUnitId === where.assetUnitId && !component.deletedAt) || null; },
      async aggregate({ where }) { return { _sum: { quantity: state.components.filter((component) => component.assetEntryId === where.assetEntryId && component.sourceLocationId === where.sourceLocationId && !component.deletedAt).reduce((sum, component) => sum + component.quantity, 0) || null } }; },
      async create({ data }) { const value = { id: `component-${state.components.length + 1}`, ...data, deletedAt: null }; state.components.push(value); return value; }
    }
  };
  return { state, client: { async $transaction(callback) { return callback(tx); }, equipmentSet: tx.equipmentSet } };
}

const actor = { id: "actor-1" };

test("13C-G-B: les trois schémas et migrations définissent le socle additif", () => {
  for (const schema of ["prisma/schema.prisma", "prisma/postgresql/schema.prisma", "prisma/postgresql-recipe/schema.prisma"]) {
    const source = readFileSync(schema, "utf8");
    assert.match(source, /model EquipmentSet \{/);
    assert.match(source, /model EquipmentSetComponent \{/);
    assert.match(source, /enum EquipmentSetStatus \{/);
    assert.match(source, /E\s+\/\/ Deprecated/);
  }
  for (const migration of [
    "prisma/migrations/20260820150000_add_equipment_set_foundation/migration.sql",
    "prisma/postgresql/migrations/20260820150000_add_equipment_set_foundation/migration.sql",
    "prisma/postgresql-recipe/migrations/20260820150000_add_equipment_set_foundation/migration.sql"
  ]) {
    const sql = readFileSync(migration, "utf8");
    assert.doesNotMatch(sql, /^\s*(DROP|DELETE|TRUNCATE|INSERT)\b/im);
    assert.match(sql, /equipment_sets/);
    assert.match(sql, /equipment_set_components_exclusive_type_check/);
  }
});

test("13C-G-B: la forme d'un composant est strictement individuelle ou quantitative", () => {
  assert.deepEqual(validateEquipmentComponentShape({ assetUnitId: "unit-1", quantity: 1 }), { assetUnitId: "unit-1", assetEntryId: null, sourceLocationId: null, quantity: 1 });
  assert.deepEqual(validateEquipmentComponentShape({ assetEntryId: "entry-1", sourceLocationId: "loc-1", quantity: 2 }), { assetUnitId: null, assetEntryId: "entry-1", sourceLocationId: "loc-1", quantity: 2 });
  assert.throws(() => validateEquipmentComponentShape({ assetUnitId: "unit-1", assetEntryId: "entry-1", sourceLocationId: "loc-1", quantity: 1 }), { code: "INVALID_COMPONENT_SHAPE" });
  assert.throws(() => validateEquipmentComponentShape({}), { code: "INVALID_COMPONENT_SHAPE" });
  for (const quantity of [0, -1, 1.5]) assert.throws(() => validateEquipmentComponentShape({ assetEntryId: "entry-1", sourceLocationId: "loc-1", quantity }), { code: "INVALID_QUANTITATIVE_COMPONENT" });
});

test("13C-G-B: création, composants et désactivation restent purement référentiels", async () => {
  const database = fakeDatabase();
  const set = await createEquipmentSet({ code: "ens-test", name: "Ensemble test", locationId: "loc-1" }, actor, { prismaClient: database.client });
  assert.equal(set.code, "ENS-TEST");
  await assert.rejects(() => createEquipmentSet({ code: "X", name: "Sans lieu" }, actor, { prismaClient: database.client }), { code: "INVALID_EQUIPMENT_SET" });
  await addEquipmentSetComponent(set.id, { assetUnitId: "unit-1", quantity: 1 }, actor, { prismaClient: database.client });
  await addEquipmentSetComponent(set.id, { assetEntryId: "entry-1", sourceLocationId: "loc-1", quantity: 4 }, actor, { prismaClient: database.client });
  assert.equal(database.state.components.length, 2);
  assert.equal(database.state.unit.locationId, "loc-1");
  assert.equal(database.state.stock, 10);
  await assert.rejects(() => addEquipmentSetComponent(set.id, { assetEntryId: "entry-1", sourceLocationId: "loc-1", quantity: 7 }, actor, { prismaClient: database.client }), { code: "INSUFFICIENT_QUANTITATIVE_STOCK" });
  const disabled = await disableEquipmentSet(set.id, actor, { prismaClient: database.client });
  assert.equal(disabled.status, "DISABLED");
  assert.ok(disabled.deletedAt instanceof Date);
});

test("13C-G-B: les contraintes SQLite protègent l'exclusivité sans modifier le patrimoine", () => {
  const directory = mkdtempSync(join(tmpdir(), "immos-13c-g-b-"));
  const databasePath = join(directory, "test.db");
  copyFileSync("prisma/dev.db", databasePath);
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    const unit = db.prepare("SELECT id, location_id FROM asset_units LIMIT 1").get();
    const entry = db.prepare("SELECT id, location_id FROM asset_entries LIMIT 1").get();
    const unitCount = db.prepare("SELECT COUNT(*) count FROM asset_units").get().count;
    db.prepare("INSERT INTO equipment_sets (id, code, name, location_id, updated_at) VALUES (?, ?, ?, ?, current_timestamp)").run("set-unit", "ENS-UNIT", "Ensemble unité", unit.location_id);
    db.prepare("INSERT INTO equipment_set_components (id, equipment_set_id, asset_unit_id, quantity, updated_at) VALUES (?, ?, ?, ?, current_timestamp)").run("component-unit", "set-unit", unit.id, 1);
    assert.throws(() => db.prepare("INSERT INTO equipment_set_components (id, equipment_set_id, asset_unit_id, asset_entry_id, source_location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?, ?, current_timestamp)").run("invalid-both", "set-unit", unit.id, entry.id, entry.location_id, 1), /CHECK constraint failed/);
    assert.throws(() => db.prepare("INSERT INTO equipment_set_components (id, equipment_set_id, quantity, updated_at) VALUES (?, ?, ?, current_timestamp)").run("invalid-none", "set-unit", 1), /CHECK constraint failed/);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM asset_units").get().count, unitCount);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM quantitative_stock_positions").get().count, 0);
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
