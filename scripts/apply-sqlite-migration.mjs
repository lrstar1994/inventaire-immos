import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsPath = join(root, "prisma", "migrations");
const databasePath = join(root, "prisma", "dev.db");

const db = new DatabaseSync(databasePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
  );
`);

const migrations = readdirSync(migrationsPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const migrationName of migrations) {
  const exists = db
    .prepare('SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE "migration_name" = ?')
    .get(migrationName);

  if (exists.count === 0) {
    const sql = readFileSync(join(migrationsPath, migrationName, "migration.sql"), "utf8");
    db.exec(sql);
    db.prepare(
      `INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "applied_steps_count")
       VALUES (?, ?, current_timestamp, ?, ?)`
    ).run(migrationName, `manual-${migrationName}`, migrationName, 1);
  }
}

db.close();
