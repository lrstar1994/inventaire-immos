import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const databasePath = path.resolve(projectRoot, process.argv[2] || "prisma/dev.db");
const outputPath = path.resolve(projectRoot, process.argv[3] || "outputs/migration/sqlite-export.json");
const schemaPath = path.resolve(projectRoot, "prisma/schema.prisma");

function parseSchema(schema) {
  const models = [];
  for (const match of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const [, model, body] = match;
    const table = body.match(/@@map\("([^"]+)"\)/)?.[1] || model;
    const fields = [];
    for (const line of body.split(/\r?\n/)) {
      const field = line.trim().match(/^(\w+)\s+(\w+)(\?)?(?:\[\])?\s*(.*)$/);
      if (!field || field[4].includes("@relation") || line.includes("[]")) continue;
      fields.push({
        prisma: field[1],
        type: field[2],
        nullable: Boolean(field[3]),
        database: field[4].match(/@map\("([^"]+)"\)/)?.[1] || field[1]
      });
    }
    models.push({ model, table, fields });
  }
  return models;
}

const schema = await readFile(schemaPath, "utf8");
const models = parseSchema(schema);
const db = new DatabaseSync(databasePath, { readOnly: true });
db.exec("PRAGMA query_only = ON");
const availableTables = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name)
);

const payload = {
  format: "inventaire-immos-sqlite-export-v1",
  exportedAt: new Date().toISOString(),
  source: databasePath,
  sqliteQueryOnly: db.prepare("PRAGMA query_only").get().query_only === 1,
  tables: {},
  missingTables: []
};

for (const model of models) {
  if (!availableTables.has(model.table)) {
    payload.missingTables.push(model.table);
    payload.tables[model.model] = [];
    continue;
  }
  const rows = db.prepare(`SELECT * FROM "${model.table.replaceAll('"', '""')}" ORDER BY id`).all();
  payload.tables[model.model] = rows.map((row) => Object.fromEntries(
    model.fields.map((field) => {
      let value = row[field.database];
      if (value !== null && field.type === "DateTime") {
        const date = typeof value === "number" || /^\d+$/.test(String(value))
          ? new Date(Number(value))
          : new Date(value);
        if (Number.isNaN(date.getTime())) throw new Error(`Date invalide : ${model.table}.${field.database}, id=${row.id}`);
        value = date.toISOString();
      } else if (value !== null && field.type === "Boolean") {
        value = Boolean(value);
      }
      return [field.prisma, value];
    })
  ));
}

db.close();
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  outputPath,
  missingTables: payload.missingTables,
  counts: Object.fromEntries(Object.entries(payload.tables).map(([model, rows]) => [model, rows.length]))
}, null, 2));
