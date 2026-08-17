import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const CONFIRMATION = "APPLY_PHASE13B_TO_REAL_SQLITE";
const migrationName = "20260817090000_add_reference_foundation";
const databasePath = resolve("prisma/dev.db");
const migrationPath = resolve("prisma/migrations", migrationName, "migration.sql");

if (process.argv[2] !== `--confirm=${CONFIRMATION}`) {
  throw new Error(`Confirmation explicite requise: --confirm=${CONFIRMATION}`);
}

const db = new DatabaseSync(databasePath);
try {
  const integrity = db.prepare("PRAGMA integrity_check").get();
  if (integrity.integrity_check !== "ok") throw new Error("SQLite réelle non intègre avant migration.");

  const columns = db.prepare("PRAGMA table_info('asset_categories')").all().map((row) => row.name);
  const expectedHistorical = ["id", "name", "code", "description", "parent_id", "display_order", "status", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"];
  if (!expectedHistorical.every((name) => columns.includes(name))) {
    throw new Error("Structure historique asset_categories inattendue.");
  }
  const newColumns = ["hierarchy_level", "tracking_mode", "control_level"];
  if (newColumns.some((name) => columns.includes(name))) {
    throw new Error("Migration 13B déjà appliquée ou état partiel interdit.");
  }

  const categories = db.prepare("SELECT id, parent_id FROM asset_categories").all();
  const byId = new Map(categories.map((row) => [row.id, row]));
  for (const category of categories) {
    let depth = 0;
    let cursor = category;
    const visited = new Set([cursor.id]);
    while (cursor.parent_id) {
      if (!byId.has(cursor.parent_id) || visited.has(cursor.parent_id)) {
        throw new Error("Hiérarchie historique ambiguë, orpheline ou cyclique.");
      }
      visited.add(cursor.parent_id);
      cursor = byId.get(cursor.parent_id);
      depth += 1;
      if (depth > 2) throw new Error("Profondeur historique supérieure à trois niveaux.");
    }
  }

  const before = {
    categories: db.prepare("SELECT COUNT(*) AS count FROM asset_categories").get().count,
    items: db.prepare("SELECT COUNT(*) AS count FROM asset_items").get().count,
    entries: db.prepare("SELECT COUNT(*) AS count FROM asset_entries").get().count,
    units: db.prepare("SELECT COUNT(*) AS count FROM asset_units").get().count
  };

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(readFileSync(migrationPath, "utf8"));
    const classified = db.prepare("SELECT hierarchy_level, COUNT(*) AS count FROM asset_categories GROUP BY hierarchy_level ORDER BY hierarchy_level").all();
    const familiesInvalid = db.prepare("SELECT COUNT(*) AS count FROM asset_categories WHERE hierarchy_level = 'FAMILY' AND (tracking_mode IS NULL OR control_level IS NULL)").get().count;
    const nonFamiliesInvalid = db.prepare("SELECT COUNT(*) AS count FROM asset_categories WHERE hierarchy_level <> 'FAMILY' AND (tracking_mode IS NOT NULL OR control_level IS NOT NULL)").get().count;
    const after = {
      categories: db.prepare("SELECT COUNT(*) AS count FROM asset_categories").get().count,
      items: db.prepare("SELECT COUNT(*) AS count FROM asset_items").get().count,
      entries: db.prepare("SELECT COUNT(*) AS count FROM asset_entries").get().count,
      units: db.prepare("SELECT COUNT(*) AS count FROM asset_units").get().count
    };
    if (JSON.stringify(before) !== JSON.stringify(after) || familiesInvalid || nonFamiliesInvalid) {
      throw new Error("Contrôle de données 13B échoué avant COMMIT.");
    }
    db.prepare(
      `INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "applied_steps_count")
       VALUES (?, ?, current_timestamp, ?, 1)`
    ).run(migrationName, `manual-${migrationName}`, migrationName);
    db.exec("COMMIT");
    console.log("PHASE13B_SQLITE_MIGRATION_APPLIED");
    console.log(JSON.stringify({ before, after, classified }));
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
} finally {
  db.close();
}
