import { readFile } from "node:fs/promises";
import path from "node:path";

if (!process.argv.includes("--execute")) {
  console.error("Import non exécuté. Ajouter explicitement --execute après validation et sur une base PostgreSQL de test vide.");
  process.exit(2);
}
if (!process.env.POSTGRES_DIRECT_URL) {
  throw new Error("POSTGRES_DIRECT_URL est obligatoire.");
}
if (process.env.CONFIRM_EMPTY_TEST_DATABASE !== "YES") {
  throw new Error("CONFIRM_EMPTY_TEST_DATABASE=YES est obligatoire pour confirmer une cible de test vide.");
}

const sourceArgument = process.argv.find((argument) => argument.startsWith("--source="));
const sourcePath = path.resolve(process.cwd(), sourceArgument?.slice("--source=".length) || "outputs/migration/sqlite-export.json");
const payload = JSON.parse(await readFile(sourcePath, "utf8"));
if (payload.format !== "inventaire-immos-sqlite-export-v1") throw new Error("Format d'export non reconnu.");
if (payload.missingTables?.length) throw new Error(`Export incomplet, tables absentes : ${payload.missingTables.join(", ")}`);

const { PrismaClient } = await import("../generated/prisma-postgresql/index.js");
const prisma = new PrismaClient({ datasourceUrl: process.env.POSTGRES_DIRECT_URL });

const order = [
  "User",
  "Supplier",
  "Location",
  "AssetCategory",
  "AssetItem",
  "AssetEntry",
  "AssetUnit",
  "AssetDocument",
  "AssetDocumentEntry",
  "AssetDocumentLine",
  "AssetMovement",
  "AssetMovementLine",
  "AssetFile",
  "SensitiveActionApproval",
  "AuditLog"
];
const deferredRelations = {
  Location: ["parentId"],
  AssetCategory: ["parentId"],
  AssetMovement: ["relatedMovementId"]
};

const delegateName = (model) => model[0].toLowerCase() + model.slice(1);
const convertDates = (value) => Object.fromEntries(Object.entries(value).map(([key, item]) => [
  key,
  typeof item === "string" && (key.endsWith("At") || key.endsWith("Date")) ? new Date(item) : item
]));

try {
  for (const model of order) {
    const rows = payload.tables[model] || [];
    const deferred = deferredRelations[model] || [];
    const data = rows.map((row) => {
      const converted = convertDates(row);
      for (const field of deferred) converted[field] = null;
      return converted;
    });
    if (data.length) await prisma[delegateName(model)].createMany({ data });
  }

  for (const [model, fields] of Object.entries(deferredRelations)) {
    for (const row of payload.tables[model] || []) {
      const data = Object.fromEntries(fields.filter((field) => row[field] !== null).map((field) => [field, row[field]]));
      if (Object.keys(data).length) await prisma[delegateName(model)].update({ where: { id: row.id }, data });
    }
  }

  console.log(JSON.stringify({
    imported: Object.fromEntries(order.map((model) => [model, (payload.tables[model] || []).length]))
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
