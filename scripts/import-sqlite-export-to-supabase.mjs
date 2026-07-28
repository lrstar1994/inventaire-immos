import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const EXPECTED_SQLITE_SHA = "8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec";
const EXPECTED_TOTAL = 222;
const EXPECTED_TABLES = 15;
const DEFAULT_EXPORT = "outputs/migration/sqlite-export/run-1";
const SELF_RELATIONS = new Map([
  ["asset_categories", ["parent_id"]],
  ["locations", ["parent_id"]],
  ["asset_movements", ["related_movement_id"]]
]);

const exportArg = process.argv.find((value) => value.startsWith("--export="));
const preflightOnly = process.argv.includes("--preflight-only");
const exportRoot = path.resolve(process.cwd(), exportArg ? exportArg.slice("--export=".length) : DEFAULT_EXPORT);
const outputRoot = path.resolve(process.cwd(), "outputs/migration/supabase-phase-6");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

const env = await loadSupabaseEnv();
const target = new URL(env.SUPABASE_DIRECT_URL);
if (!["postgres:", "postgresql:"].includes(target.protocol)) throw new Error("Import refusé : la cible n'est pas PostgreSQL.");
if (target.searchParams.get("schema") !== "immos" || env.DATABASE_SCHEMA !== "immos") {
  throw new Error("Import refusé : le schéma cible n'est pas immos.");
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

const prisma = new PrismaClient({ datasourceUrl: env.SUPABASE_DIRECT_URL, errorFormat: "minimal" });
await mkdir(outputRoot, { recursive: true });
const startedAt = new Date();
let committed = false;

async function inspectTarget(client) {
  const [identity] = await client.$queryRawUnsafe(
    `SELECT current_database() AS database_name, current_schema() AS current_schema,
            EXISTS (SELECT 1 FROM pg_stat_ssl WHERE pid = pg_backend_pid() AND ssl) AS ssl_active`
  );
  const tables = await client.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='immos' AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations'
     ORDER BY table_name`
  );
  const publicTables = await client.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name = ANY($1::text[]) ORDER BY table_name`,
    manifest.tables.map((table) => table.table)
  );
  const migrations = await client.$queryRawUnsafe(
    `SELECT migration_name, checksum, finished_at, rolled_back_at
     FROM "immos"."_prisma_migrations" ORDER BY migration_name`
  );
  const constraints = await client.$queryRawUnsafe(
    `SELECT c.conname, c.contype, pg_get_constraintdef(c.oid) AS definition
     FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
     WHERE n.nspname='immos' ORDER BY c.conname`
  );
  const counts = {};
  for (const { table } of manifest.tables) {
    const [row] = await client.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "immos".${quote(table)}`);
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
  if (before.currentSchema !== "immos" || !sslRequiredByConnection) {
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
      scope: "15 tables métier du schéma immos uniquement",
      order: manifest.importPlan.rollbackCleanupOrder,
      note: "DELETE transactionnel explicite; ne supprime ni schéma, ni migrations, ni enums, ni contraintes."
    }
  };
  await writeFile(path.join(outputRoot, "pre-import-state.json"), serialize(snapshot), "utf8");
  if (preflightOnly) {
    console.log(serialize({ result: "PREFLIGHT_OK", tables: before.tables.length, totalRows: 0, storageEmpty: true }).trim());
    process.exitCode = 0;
  } else {
    const typeRows = await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, data_type, udt_name
       FROM information_schema.columns WHERE table_schema='immos' AND table_name = ANY($1::text[])`,
      expectedNames
    );
    const typeMap = new Map(typeRows.map((row) => [`${row.table_name}.${row.column_name}`, row]));
    const insertionOrder = manifest.importPlan.insertionOrder;

    await prisma.$transaction(async (tx) => {
      for (const table of insertionOrder) {
        await tx.$executeRawUnsafe(`LOCK TABLE "immos".${quote(table)} IN SHARE ROW EXCLUSIVE MODE`);
      }
      for (const table of insertionOrder) {
        const [row] = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "immos".${quote(table)}`);
        if (row.count !== 0) throw new Error(`Import annulé : ${table} n'est plus vide.`);
      }
      for (const table of insertionOrder) {
        const definition = manifest.tables.find((item) => item.table === table);
        const deferred = new Set(SELF_RELATIONS.get(table) || []);
        for (const sourceRow of source.get(table)) {
          const columns = definition.columns;
          const values = columns.map((column) => deferred.has(column) ? null : sourceRow[column]);
          const placeholders = columns.map((column, index) => {
            const type = typeMap.get(`${table}.${column}`);
            if (!type) throw new Error(`Type PostgreSQL introuvable : ${table}.${column}`);
            if (type.data_type === "USER-DEFINED") return `$${index + 1}::"immos".${quote(type.udt_name)}`;
            if (type.data_type === "timestamp with time zone") return `$${index + 1}::timestamptz`;
            if (type.data_type === "boolean") return `$${index + 1}::boolean`;
            if (type.data_type === "integer") return `$${index + 1}::integer`;
            return `$${index + 1}::text`;
          });
          await tx.$executeRawUnsafe(
            `INSERT INTO "immos".${quote(table)} (${columns.map(quote).join(",")})
             VALUES (${placeholders.join(",")})`,
            ...values
          );
        }
      }
      for (const [table, columns] of SELF_RELATIONS) {
        for (const row of source.get(table)) {
          for (const column of columns) {
            if (row[column] !== null) {
              await tx.$executeRawUnsafe(
                `UPDATE "immos".${quote(table)} SET ${quote(column)}=$1::text WHERE "id"=$2::text`,
                row[column], row.id
              );
            }
          }
        }
      }
    }, { maxWait: 20_000, timeout: 120_000 });
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
      storageBefore
    };
    await writeFile(path.join(outputRoot, "import-result.json"), serialize(report), "utf8");
    console.log(serialize({ result: report.result, totalInserted: report.totalInserted, durationMs: report.durationMs }).trim());
  }
} catch (error) {
  const failure = {
    failedAt: new Date().toISOString(),
    result: committed ? "POST_COMMIT_CHECK_FAILED" : "ROLLBACK",
    error: error.message
  };
  await writeFile(path.join(outputRoot, "import-failure.json"), serialize(failure), "utf8").catch(() => {});
  throw error;
} finally {
  await prisma.$disconnect();
}
