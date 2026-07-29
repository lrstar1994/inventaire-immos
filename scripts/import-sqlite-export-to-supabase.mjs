import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const EXPECTED_SQLITE_SHA = "8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec";
const EXPECTED_TOTAL = 222;
const EXPECTED_TABLES = 15;
const DEFAULT_EXPORT = "outputs/migration/sqlite-export/run-1";
const recipeMode = process.argv.includes("--recipe-phase8");
const targetSchema = recipeMode ? "immos_recipe_phase8" : "immos";
const HIERARCHICAL_RELATIONS = new Map([
  ["asset_categories", "parent_id"],
  ["locations", "parent_id"]
]);
const SELF_RELATIONS = new Map([
  ["asset_movements", ["related_movement_id"]]
]);

const exportArg = process.argv.find((value) => value.startsWith("--export="));
const preflightOnly = process.argv.includes("--preflight-only");
const exportRoot = path.resolve(process.cwd(), exportArg ? exportArg.slice("--export=".length) : DEFAULT_EXPORT);
const outputRoot = path.resolve(
  process.cwd(),
  recipeMode ? "outputs/migration/supabase-phase-8/import" : "outputs/migration/supabase-phase-6"
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

function hierarchyLevels(table, rows, parentColumn) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of rows) {
    if (row[parentColumn] !== null && !byId.has(row[parentColumn])) {
      throw new Error(`Parent absent dans ${table} pour ${row.id}.`);
    }
  }
  const remaining = new Map(byId);
  const inserted = new Set();
  const levels = [];
  while (remaining.size) {
    const level = [...remaining.values()]
      .filter((row) => row[parentColumn] === null || inserted.has(row[parentColumn]))
      .sort((left, right) => left.id.localeCompare(right.id));
    if (!level.length) {
      throw new Error(`Cycle hierarchique detecte dans ${table}.`);
    }
    levels.push(level);
    for (const row of level) {
      inserted.add(row.id);
      remaining.delete(row.id);
    }
  }
  return levels;
}

const env = await loadSupabaseEnv();
const target = new URL(env.SUPABASE_DIRECT_URL);
if (recipeMode) target.searchParams.set("schema", targetSchema);
if (!["postgres:", "postgresql:"].includes(target.protocol)) throw new Error("Import refusé : la cible n'est pas PostgreSQL.");
if (target.searchParams.get("schema") !== targetSchema || env.DATABASE_SCHEMA !== "immos") {
  throw new Error(`Import refusé : le schéma cible n'est pas ${targetSchema}.`);
}

const manifestBytes = await readFile(path.join(exportRoot, "manifest.json"));
const manifest = JSON.parse(manifestBytes);
if (manifest.format !== "inventaire-immos-sqlite-json-v1") throw new Error("Format de manifeste inattendu.");
if (manifest.database?.sha256 !== EXPECTED_SQLITE_SHA) throw new Error("Empreinte SQLite du manifeste inattendue.");
if (manifest.tables?.length !== EXPECTED_TABLES) throw new Error("Le manifeste ne contient pas exactement 15 tables.");
if (manifest.tables.reduce((sum, table) => sum + table.rows, 0) !== EXPECTED_TOTAL) {
  throw new Error("Le manifeste ne contient pas exactement 222 lignes.");
}
if (manifest.tables.some((table) => table.table === "asset_files" && table.rows !== 0)) {
  throw new Error("asset_files doit être vide.");
}
if (manifest.importPlan?.unresolvedCycles?.length) throw new Error("Le plan d'import contient un cycle non résolu.");

const source = new Map();
for (const table of manifest.tables) {
  const bytes = await readFile(path.join(exportRoot, table.file));
  if (hash(bytes) !== table.sha256) throw new Error(`Empreinte invalide pour ${table.file}.`);
  const rows = JSON.parse(bytes);
  if (!Array.isArray(rows) || rows.length !== table.rows) throw new Error(`Comptage invalide pour ${table.table}.`);
  source.set(table.table, rows);
}

const prisma = new PrismaClient({ datasourceUrl: target.toString(), errorFormat: "minimal" });
const schemaQ = quote(targetSchema);
await mkdir(outputRoot, { recursive: true });
const startedAt = new Date();
let committed = false;
let failureContext = { table: null, batch: null, processedRows: 0, transactionElapsedMs: null };

async function inspectTarget(client) {
  const [identity] = await client.$queryRawUnsafe(
    `SELECT current_database() AS database_name, current_schema() AS current_schema,
            EXISTS (SELECT 1 FROM pg_stat_ssl WHERE pid = pg_backend_pid() AND ssl) AS ssl_active`
  );
  const tables = await client.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema=$1 AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations'
     ORDER BY table_name`
    , targetSchema
  );
  const publicTables = await client.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name = ANY($1::text[]) ORDER BY table_name`,
    manifest.tables.map((table) => table.table)
  );
  const migrations = await client.$queryRawUnsafe(
    `SELECT migration_name, checksum, finished_at, rolled_back_at
     FROM ${schemaQ}."_prisma_migrations" ORDER BY migration_name`
  );
  const constraints = await client.$queryRawUnsafe(
    `SELECT c.conname, c.contype, pg_get_constraintdef(c.oid) AS definition
     FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
     WHERE n.nspname=$1 ORDER BY c.conname`, targetSchema
  );
  const counts = {};
  for (const { table } of manifest.tables) {
    const [row] = await client.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM ${schemaQ}.${quote(table)}`);
    counts[table] = row.count;
  }
  return {
    checkedAt: new Date().toISOString(),
    databaseName: identity.database_name,
    currentSchema: identity.current_schema,
    sslActive: identity.ssl_active,
    tables: tables.map((row) => row.table_name),
    publicInventoryTables: publicTables.map((row) => row.table_name),
    migrations,
    constraints,
    counts
  };
}

async function inspectStorage() {
  const base = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/storage/v1`;
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, "content-type": "application/json" };
  if (env.SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ")) headers.authorization = `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`;
  const bucketResponse = await fetch(`${base}/bucket/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}`, { headers });
  if (!bucketResponse.ok) throw new Error(`Lecture du bucket refusée (${bucketResponse.status}).`);
  const bucket = await bucketResponse.json();
  const objectsResponse = await fetch(`${base}/object/list/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}`, {
    method: "POST", headers, body: JSON.stringify({ prefix: "", limit: 1, offset: 0 })
  });
  if (!objectsResponse.ok) throw new Error(`Lecture des objets Storage refusée (${objectsResponse.status}).`);
  const objects = await objectsResponse.json();
  return { bucket: bucket.id, private: bucket.public === false, empty: Array.isArray(objects) && objects.length === 0 };
}

try {
  const before = await inspectTarget(prisma);
  const storageBefore = await inspectStorage();
  const expectedNames = manifest.tables.map((table) => table.table).sort();
  const sslRequiredByConnection = target.searchParams.get("sslmode") === "require";
  if (before.currentSchema !== targetSchema || !sslRequiredByConnection) {
    throw new Error("Cible refusée : schéma actif ou exigence SSL invalide.");
  }
  if (JSON.stringify(before.tables) !== JSON.stringify(expectedNames)) throw new Error("Cible refusée : les 15 tables ne correspondent pas.");
  if (before.publicInventoryTables.length) throw new Error("Cible refusée : tables Inventaire Immos présentes dans public.");
  if (Object.values(before.counts).some((count) => count !== 0)) throw new Error("Cible refusée : au moins une table métier n'est pas vide.");
  if (!before.migrations.length || before.migrations.some((migration) => !migration.finished_at || migration.rolled_back_at)) {
    throw new Error("Cible refusée : baseline Prisma non validée.");
  }
  if (!storageBefore.private || !storageBefore.empty) throw new Error("Cible refusée : le bucket n'est pas privé et vide.");

  const snapshot = {
    sourceExport: path.relative(process.cwd(), exportRoot).replaceAll("\\", "/"),
    sourceManifestSha256: hash(manifestBytes),
    sourceSqliteSha256: manifest.database.sha256,
    sourceFiles: Object.fromEntries(manifest.tables.map((table) => [table.table, table.sha256])),
    target: before,
    sslRequiredByConnection,
    sslObservation:
      before.sslActive ? "TLS observé par pg_stat_ssl" :
      "sslmode=require confirmé; pg_stat_ssl ne voit pas TLS derrière le pooler Supabase",
    storage: storageBefore,
    cleanupProcedure: {
      scope: `15 tables métier du schéma ${targetSchema} uniquement`,
      order: manifest.importPlan.rollbackCleanupOrder,
      note: "DELETE transactionnel explicite; ne supprime ni schéma, ni migrations, ni enums, ni contraintes."
    }
  };
  await writeFile(path.join(outputRoot, "pre-import-state.json"), serialize(snapshot), "utf8");
  if (preflightOnly) {
    console.log(serialize({ result: "PREFLIGHT_OK", tables: before.tables.length, totalRows: 0, storageEmpty: true }).trim());
    process.exitCode = 0;
  } else {
    const insertionOrder = manifest.importPlan.insertionOrder;
    const delegateByTable = {
      users: "user", suppliers: "supplier", locations: "location",
      asset_categories: "assetCategory", asset_items: "assetItem", asset_entries: "assetEntry",
      asset_units: "assetUnit", asset_files: "assetFile", asset_movements: "assetMovement",
      asset_movement_lines: "assetMovementLine", asset_documents: "assetDocument",
      asset_document_entries: "assetDocumentEntry", asset_document_lines: "assetDocumentLine",
      sensitive_action_approvals: "sensitiveActionApproval", audit_logs: "auditLog"
    };
    const modelByTable = new Map(
      Prisma.dmmf.datamodel.models.map((model) => [model.dbName || model.name, model])
    );
    const prepared = new Map();
    const batchSize = 50;
    for (const table of insertionOrder) {
      const model = modelByTable.get(table);
      if (!model) throw new Error(`Modele Prisma introuvable pour ${table}.`);
      const fields = new Map(
        model.fields.filter((field) => field.kind !== "object").map((field) => [field.dbName || field.name, field])
      );
      const deferred = new Set(SELF_RELATIONS.get(table) || []);
      const physicalLevels = HIERARCHICAL_RELATIONS.has(table)
        ? hierarchyLevels(table, source.get(table), HIERARCHICAL_RELATIONS.get(table))
        : [source.get(table)];
      const levels = physicalLevels.map((physicalRows) => physicalRows.map((row) => Object.fromEntries(
        Object.entries(row).map(([column, value]) => {
          const field = fields.get(column);
          if (!field) throw new Error(`Champ Prisma introuvable : ${table}.${column}`);
          const normalized = deferred.has(column)
            ? null
            : (value !== null && field.type === "DateTime" ? new Date(value) : value);
          return [field.name, normalized];
        })
      )));
      const rows = levels.flat();
      const batches = [];
      for (const level of levels) {
        for (let offset = 0; offset < level.length; offset += batchSize) {
          batches.push(level.slice(offset, offset + batchSize));
        }
      }
      prepared.set(table, {
        delegate: delegateByTable[table],
        rows,
        batches,
        hierarchyLevels: HIERARCHICAL_RELATIONS.has(table) ? levels.length : null
      });
    }

    const transactionStartedAt = Date.now();
    await prisma.$transaction(async (tx) => {
      for (const table of insertionOrder) {
        const plan = prepared.get(table);
        const tableStartedAt = Date.now();
        console.log(JSON.stringify({
          event: "TABLE_START", table, rows: plan.rows.length,
          batches: plan.batches.length, hierarchyLevels: plan.hierarchyLevels,
          startedAt: new Date().toISOString()
        }));
        for (let index = 0; index < plan.batches.length; index += 1) {
          failureContext = {
            table,
            batch: index + 1,
            processedRows: failureContext.processedRows,
            transactionElapsedMs: Date.now() - transactionStartedAt
          };
          await tx[plan.delegate].createMany({ data: plan.batches[index] });
          failureContext.processedRows += plan.batches[index].length;
        }
        console.log(JSON.stringify({
          event: "TABLE_DONE", table, rows: plan.rows.length,
          durationMs: Date.now() - tableStartedAt
        }));
      }
      for (const [table, columns] of SELF_RELATIONS) {
        const model = modelByTable.get(table);
        const fields = new Map(model.fields.map((field) => [field.dbName || field.name, field.name]));
        const delegate = delegateByTable[table];
        for (const row of source.get(table)) {
          for (const column of columns) {
            if (row[column] !== null) {
              failureContext = {
                table,
                batch: "self-relation",
                processedRows: failureContext.processedRows,
                transactionElapsedMs: Date.now() - transactionStartedAt
              };
              await tx[delegate].update({
                where: { id: row.id },
                data: { [fields.get(column)]: row[column] }
              });
            }
          }
        }
      }
    }, { maxWait: 30_000, timeout: 300_000 });
    committed = true;
    const after = await inspectTarget(prisma);
    const report = {
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      result: "COMMIT",
      sourceExport: snapshot.sourceExport,
      insertionOrder,
      insertedRows: after.counts,
      totalInserted: Object.values(after.counts).reduce((sum, count) => sum + count, 0),
      storageBefore,
      preparedWriteQueries:
        [...prepared.values()].reduce((sum, plan) => sum + plan.batches.length, 0) +
        [...SELF_RELATIONS.entries()].reduce(
          (sum, [table, columns]) => sum + source.get(table).reduce(
            (rowSum, row) => rowSum + columns.filter((column) => row[column] !== null).length, 0
          ), 0
        ),
      hierarchyLevels: Object.fromEntries(
        [...prepared.entries()]
          .filter(([, plan]) => plan.hierarchyLevels !== null)
          .map(([table, plan]) => [table, plan.hierarchyLevels])
      )
    };
    await writeFile(path.join(outputRoot, "import-result.json"), serialize(report), "utf8");
    console.log(serialize({ result: report.result, totalInserted: report.totalInserted, durationMs: report.durationMs }).trim());
  }
} catch (error) {
  const failure = {
    failedAt: new Date().toISOString(),
    result: committed ? "POST_COMMIT_CHECK_FAILED" : "ROLLBACK",
    error: error.message,
    prismaCode: error.code || null,
    failureContext: {
      ...failureContext,
      transactionElapsedMs: failureContext.transactionElapsedMs ?? (Date.now() - startedAt.getTime())
    },
    transactionOptions: { maxWaitMs: 30_000, timeoutMs: 300_000 }
  };
  await writeFile(path.join(outputRoot, "import-failure.json"), serialize(failure), "utf8").catch(() => {});
  throw error;
} finally {
  await prisma.$disconnect();
}
