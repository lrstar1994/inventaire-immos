import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const exportRoot = path.resolve(process.cwd(), "outputs/migration/sqlite-export/run-1");
const outputRoot = path.resolve(process.cwd(), "outputs/migration/supabase-phase-6");
const manifest = JSON.parse(await readFile(path.join(exportRoot, "manifest.json"), "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const env = await loadSupabaseEnv();
if (new URL(env.SUPABASE_DIRECT_URL).searchParams.get("schema") !== "immos") throw new Error("Schéma cible invalide.");
const prisma = new PrismaClient({ datasourceUrl: env.SUPABASE_DIRECT_URL, errorFormat: "minimal" });
await mkdir(outputRoot, { recursive: true });
const delegates = {
  users: "user",
  suppliers: "supplier",
  locations: "location",
  asset_categories: "assetCategory",
  asset_items: "assetItem",
  asset_entries: "assetEntry",
  asset_units: "assetUnit",
  asset_files: "assetFile",
  asset_movements: "assetMovement",
  asset_movement_lines: "assetMovementLine",
  asset_documents: "assetDocument",
  asset_document_entries: "assetDocumentEntry",
  asset_document_lines: "assetDocumentLine",
  sensitive_action_approvals: "sensitiveActionApproval",
  audit_logs: "auditLog"
};

function normalizeTarget(value, sourceValue) {
  if (value === null) return null;
  if (sourceValue === null) return value;
  if (typeof sourceValue === "string" && /^\d{4}-\d{2}-\d{2}T/.test(sourceValue)) {
    return new Date(value).toISOString();
  }
  return value;
}

try {
  const comparisons = [];
  let total = 0;
  for (const definition of manifest.tables) {
    const sourceRows = JSON.parse(await readFile(path.join(exportRoot, definition.file), "utf8"));
    const targetRows = await prisma.$queryRawUnsafe(
      `SELECT ${definition.columns.map(quote).join(",")} FROM "immos".${quote(definition.table)}
       ORDER BY ${quote(definition.primaryKey)} ASC`
    );
    const normalized = targetRows.map((row, rowIndex) => Object.fromEntries(
      definition.columns.map((column) => [column, normalizeTarget(row[column], sourceRows[rowIndex]?.[column])])
    ));
    const sourceSha256 = hash(Buffer.from(serialize(sourceRows), "utf8"));
    const targetSha256 = hash(Buffer.from(serialize(normalized), "utf8"));
    const sourceIds = sourceRows.map((row) => row[definition.primaryKey]);
    const targetIds = normalized.map((row) => row[definition.primaryKey]);
    const comparison = {
      table: definition.table,
      sourceRows: sourceRows.length,
      targetRows: normalized.length,
      idsEqual: JSON.stringify(sourceIds) === JSON.stringify(targetIds),
      sourceSha256,
      targetSha256,
      equal: sourceSha256 === targetSha256
    };
    comparisons.push(comparison);
    total += normalized.length;
  }
  const fkErrors = await prisma.$queryRawUnsafe(
    `SELECT tc.table_name, kcu.column_name, ccu.table_name AS referenced_table
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema
     JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema
     WHERE tc.table_schema='immos' AND tc.constraint_type='FOREIGN KEY'
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.columns x WHERE x.table_schema='__never__'
       )`
  );
  const historicalAudits = await prisma.$queryRawUnsafe(
    `SELECT entity_table, COUNT(*)::int AS count FROM "immos"."audit_logs" a
     WHERE entity_table = ANY(ARRAY['asset_items','asset_entries','asset_documents','asset_movements'])
       AND NOT (
         (entity_table='asset_items' AND EXISTS (SELECT 1 FROM "immos"."asset_items" x WHERE x.id=a.entity_id)) OR
         (entity_table='asset_entries' AND EXISTS (SELECT 1 FROM "immos"."asset_entries" x WHERE x.id=a.entity_id)) OR
         (entity_table='asset_documents' AND EXISTS (SELECT 1 FROM "immos"."asset_documents" x WHERE x.id=a.entity_id)) OR
         (entity_table='asset_movements' AND EXISTS (SELECT 1 FROM "immos"."asset_movements" x WHERE x.id=a.entity_id))
       )
     GROUP BY entity_table ORDER BY entity_table`
  );
  const [assetFiles] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "immos"."asset_files"`);
  const prismaCounts = {};
  const prismaRepresentativeIds = {};
  for (const definition of manifest.tables) {
    const delegate = prisma[delegates[definition.table]];
    prismaCounts[definition.table] = await delegate.count();
    prismaRepresentativeIds[definition.table] = (await delegate.findFirst({
      orderBy: { id: "asc" },
      select: { id: true }
    }))?.id ?? null;
  }
  const prismaRelations = {
    assetItemWithCategory: Boolean(await prisma.assetItem.findFirst({
      select: { id: true, category: { select: { id: true } } }
    })),
    assetEntryWithItemAndLocation: Boolean(await prisma.assetEntry.findFirst({
      select: { id: true, assetItem: { select: { id: true } }, location: { select: { id: true } } }
    })),
    assetUnitWithItemAndLocation: Boolean(await prisma.assetUnit.findFirst({
      select: { id: true, assetItem: { select: { id: true } }, location: { select: { id: true } } }
    })),
    movementLineWithRelations: Boolean(await prisma.assetMovementLine.findFirst({
      select: { id: true, movement: { select: { id: true } }, assetUnit: { select: { id: true } } }
    })),
    documentLineWithDocument: Boolean(await prisma.assetDocumentLine.findFirst({
      select: { id: true, document: { select: { id: true } } }
    }))
  };
  const enumValues = await prisma.$queryRawUnsafe(
    `SELECT 'users.role' AS field, role::text AS value FROM "immos"."users" GROUP BY role
     UNION ALL SELECT 'users.status', status::text FROM "immos"."users" GROUP BY status
     UNION ALL SELECT 'asset_entries.entry_type', entry_type::text FROM "immos"."asset_entries" GROUP BY entry_type
     UNION ALL SELECT 'asset_entries.initial_condition', initial_condition::text FROM "immos"."asset_entries" GROUP BY initial_condition
     UNION ALL SELECT 'asset_entries.initial_status', initial_status::text FROM "immos"."asset_entries" GROUP BY initial_status
     UNION ALL SELECT 'asset_entries.entry_status', entry_status::text FROM "immos"."asset_entries" GROUP BY entry_status
     UNION ALL SELECT 'asset_entries.information_status', information_status::text FROM "immos"."asset_entries" GROUP BY information_status
     UNION ALL SELECT 'asset_units.condition', condition::text FROM "immos"."asset_units" GROUP BY condition
     UNION ALL SELECT 'asset_units.status', status::text FROM "immos"."asset_units" GROUP BY status
     UNION ALL SELECT 'asset_units.information_status', information_status::text FROM "immos"."asset_units" GROUP BY information_status
     UNION ALL SELECT 'asset_movements.movement_type', movement_type::text FROM "immos"."asset_movements" GROUP BY movement_type
     UNION ALL SELECT 'asset_movements.movement_status', movement_status::text FROM "immos"."asset_movements" GROUP BY movement_status
     UNION ALL SELECT 'asset_documents.document_type', document_type::text FROM "immos"."asset_documents" GROUP BY document_type
     UNION ALL SELECT 'asset_documents.status', status::text FROM "immos"."asset_documents" GROUP BY status
     ORDER BY field, value`
  );
  const [fkViolationCount] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM (
       SELECT 1 FROM "immos"."asset_items" c LEFT JOIN "immos"."asset_categories" p ON p.id=c.category_id WHERE p.id IS NULL
       UNION ALL SELECT 1 FROM "immos"."asset_entries" c LEFT JOIN "immos"."asset_items" p ON p.id=c.asset_item_id WHERE p.id IS NULL
       UNION ALL SELECT 1 FROM "immos"."asset_units" c LEFT JOIN "immos"."asset_items" p ON p.id=c.asset_item_id WHERE p.id IS NULL
       UNION ALL SELECT 1 FROM "immos"."asset_movement_lines" c LEFT JOIN "immos"."asset_movements" p ON p.id=c.movement_id WHERE p.id IS NULL
       UNION ALL SELECT 1 FROM "immos"."asset_document_entries" c LEFT JOIN "immos"."asset_documents" p ON p.id=c.document_id WHERE p.id IS NULL
       UNION ALL SELECT 1 FROM "immos"."asset_document_lines" c LEFT JOIN "immos"."asset_documents" p ON p.id=c.document_id WHERE p.id IS NULL
     ) invalid`
  );
  const storageBase = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/storage/v1`;
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, "content-type": "application/json" };
  if (env.SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ")) headers.authorization = `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`;
  const objectsResponse = await fetch(`${storageBase}/object/list/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}`, {
    method: "POST", headers, body: JSON.stringify({ prefix: "", limit: 1, offset: 0 })
  });
  if (!objectsResponse.ok) throw new Error(`Lecture Storage refusée (${objectsResponse.status}).`);
  const objects = await objectsResponse.json();
  const report = {
    checkedAt: new Date().toISOString(),
    readOnly: true,
    totalRows: total,
    comparisons,
    allTablesEqual: comparisons.every((item) => item.equal && item.idsEqual),
    declaredForeignKeysInspected: fkErrors.length,
    foreignKeyViolations: fkViolationCount.count,
    historicalAuditReferences: historicalAudits,
    historicalAuditReferenceTotal: historicalAudits.reduce((sum, row) => sum + row.count, 0),
    assetFilesRows: assetFiles.count,
    storageEmpty: Array.isArray(objects) && objects.length === 0,
    prismaCounts,
    prismaRepresentativeIds,
    prismaRelations,
    enumValues
  };
  await writeFile(path.join(outputRoot, "verification.json"), serialize(report), "utf8");
  if (total !== 222 || !report.allTablesEqual || report.foreignKeyViolations || report.historicalAuditReferenceTotal !== 12 ||
      report.assetFilesRows !== 0 || !report.storageEmpty) {
    throw new Error("La vérification stricte de l'import a échoué.");
  }
  if (manifest.tables.some((table) => prismaCounts[table.table] !== table.rows) ||
      Object.values(prismaRelations).some((valid) => !valid)) {
    throw new Error("La vérification Prisma en lecture seule a échoué.");
  }
  console.log(serialize({
    result: "VERIFIED",
    tables: comparisons.length,
    totalRows: total,
    allTablesEqual: report.allTablesEqual,
    historicalAuditReferenceTotal: report.historicalAuditReferenceTotal,
    assetFilesRows: report.assetFilesRows,
    storageEmpty: report.storageEmpty
  }).trim());
} finally {
  await prisma.$disconnect();
}
