import assert from "node:assert/strict";
import test from "node:test";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

import { assertIndividualTrackingMode } from "../lib/asset-reference-foundation.js";
import { assertQuantitativeFoundationSchema, QUANTITATIVE_TABLES } from "../lib/quantitative-foundation.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDatabase = join(root, "prisma", "dev.db");
const sqliteMigration = join(root, "prisma", "migrations", "20260820110000_add_quantitative_foundation", "migration.sql");
const postgresqlMigration = join(root, "prisma", "postgresql", "migrations", "20260820110000_add_quantitative_foundation", "migration.sql");
const recipeMigration = join(root, "prisma", "postgresql-recipe", "migrations", "20260820110000_add_quantitative_foundation", "migration.sql");

async function withMigratedCopy(callback) {
  const directory = await mkdtemp(join(tmpdir(), "immos-phase13c-c-"));
  const databasePath = join(directory, "dev-copy.db");
  await copyFile(sourceDatabase, databasePath);
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    const tableCount = db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('quantitative_stock_positions', 'quantitative_movement_lines')").get().count;
    if (tableCount === 0) {
      db.exec(await readFile(sqliteMigration, "utf8"));
    } else if (tableCount !== 2) {
      throw new Error("Socle quantitatif SQLite partiellement présent dans la copie de test.");
    }
    return await callback(db);
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
}

function fixtureClient({ tables = QUANTITATIVE_TABLES, constraints = QUANTITATIVE_TABLES.map((table) => table.constraint) } = {}) {
  return {
    async $queryRawUnsafe(query) {
      if (query.includes("information_schema.tables")) return tables.map((table) => ({ table_name: table.name }));
      if (query.includes("information_schema.columns")) {
        return tables.flatMap((table) => table.columns.map((column) => ({ table_name: table.name, column_name: column })));
      }
      if (query.includes("pg_constraint")) return constraints.map((conname) => ({ conname }));
      throw new Error("Requête de garde inattendue.");
    }
  };
}

test("les migrations quantitatives sont additives et ciblées sur leurs schémas", async () => {
  const [sqlite, postgresql, recipe] = await Promise.all([
    readFile(sqliteMigration, "utf8"),
    readFile(postgresqlMigration, "utf8"),
    readFile(recipeMigration, "utf8")
  ]);
  for (const migration of [sqlite, postgresql, recipe]) {
    assert.match(migration, /CREATE TABLE/);
    assert.doesNotMatch(migration, /^\s*(DROP|DELETE|UPDATE|INSERT)\b/im);
    assert.match(migration, /quantitative_stock_positions/);
    assert.match(migration, /quantitative_movement_lines/);
  }
  assert.match(postgresql, /"immos"\."quantitative_stock_positions"/);
  assert.match(recipe, /"immos_recipe_phase8"\."quantitative_stock_positions"/);
});

test("la copie SQLite crée deux tables quantitatives vides avec les contraintes attendues", async () => {
  await withMigratedCopy(async (db) => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('quantitative_stock_positions', 'quantitative_movement_lines') ORDER BY name").all();
    assert.deepEqual(tables.map((table) => table.name), ["quantitative_movement_lines", "quantitative_stock_positions"]);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM quantitative_stock_positions").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM quantitative_movement_lines").get().count, 0);
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  });
});

test("une position accepte zéro, refuse le négatif et impose unicité lot + emplacement", async () => {
  await withMigratedCopy(async (db) => {
    const fixture = db.prepare("SELECT id AS entryId, location_id AS locationId FROM asset_entries LIMIT 1").get();
    assert.ok(fixture?.entryId && fixture?.locationId, "fixture historique disponible");
    const insert = db.prepare("INSERT INTO quantitative_stock_positions (id, asset_entry_id, location_id, available_quantity, updated_at) VALUES (?, ?, ?, ?, current_timestamp)");
    insert.run("position-zero", fixture.entryId, fixture.locationId, 0);
    assert.equal(db.prepare("SELECT available_quantity AS quantity FROM quantitative_stock_positions WHERE id = 'position-zero'").get().quantity, 0);
    assert.throws(() => insert.run("position-duplicate", fixture.entryId, fixture.locationId, 1), /UNIQUE constraint failed/);
    assert.throws(() => insert.run("position-negative", fixture.entryId, fixture.locationId, -1), /CHECK constraint failed/);
  });
});

test("une ligne quantitative est liée au mouvement, au lot et aux emplacements, et refuse quantité non positive", async () => {
  await withMigratedCopy(async (db) => {
    const fixture = db.prepare("SELECT e.id AS entryId, e.location_id AS locationId, (SELECT id FROM asset_movements LIMIT 1) AS movementId FROM asset_entries e LIMIT 1").get();
    assert.ok(fixture?.entryId && fixture?.locationId && fixture?.movementId, "fixtures historiques disponibles");
    const insert = db.prepare("INSERT INTO quantitative_movement_lines (id, movement_id, asset_entry_id, from_location_id, to_location_id, quantity) VALUES (?, ?, ?, ?, ?, ?)");
    insert.run("line-positive", fixture.movementId, fixture.entryId, fixture.locationId, fixture.locationId, 1);
    const relation = db.prepare("SELECT line.id, entry.entry_number AS entryNumber, movement.movement_number AS movementNumber, location.name AS locationName FROM quantitative_movement_lines line JOIN asset_entries entry ON entry.id = line.asset_entry_id JOIN asset_movements movement ON movement.id = line.movement_id JOIN locations location ON location.id = line.from_location_id WHERE line.id = 'line-positive'").get();
    assert.equal(relation.id, "line-positive");
    assert.ok(relation.entryNumber && relation.movementNumber && relation.locationName);
    assert.throws(() => insert.run("line-zero", fixture.movementId, fixture.entryId, fixture.locationId, fixture.locationId, 0), /CHECK constraint failed/);
    assert.throws(() => insert.run("line-negative", fixture.movementId, fixture.entryId, fixture.locationId, fixture.locationId, -1), /CHECK constraint failed/);
  });
});

test("le garde PostgreSQL exige tables, colonnes et contraintes quantitatives", async () => {
  await assert.doesNotReject(() => assertQuantitativeFoundationSchema(fixtureClient(), "immos"));
  await assert.rejects(
    () => assertQuantitativeFoundationSchema(fixtureClient({ constraints: ["quantitative_stock_positions_available_quantity_check"] }), "immos"),
    /contraintes quantitatives essentielles absentes/
  );
});

test("le flux individuel demeure isolé et Q/QI/E restent bloqués avant 13C-D", async () => {
  const assetService = await readFile(join(root, "lib", "asset-service.js"), "utf8");
  assert.doesNotMatch(assetService, /quantitativeStockPosition|quantitativeMovementLine/);
  assert.equal(assertIndividualTrackingMode({ category: { trackingMode: "I" } }), "I");
  for (const mode of ["Q", "QI", "E"]) {
    assert.throws(() => assertIndividualTrackingMode({ category: { trackingMode: mode } }), { code: "TRACKING_MODE_NOT_OPERATIONAL" });
  }
});
