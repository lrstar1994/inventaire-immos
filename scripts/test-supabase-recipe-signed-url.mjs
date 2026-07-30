import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient as ProductionClient } from "../generated/prisma-postgresql/index.js";
import { PrismaClient as RecipeClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const EXPECTED_RECIPE_SCHEMA = "immos_recipe_phase8";
const EXPECTED_PRODUCTION_SCHEMA = "immos";
const EXPECTED_BUCKET = "asset-files";
const EXPECTED_BUSINESS_ROWS = 253;
const EXPECTED_ASSET_UNITS = 13;
const EXPECTED_ASSET_FILES = 0;
const SIGNED_URL_TTL_SECONDS = 300;
const FILE_NAME = "phase10d-e-signed-url-test.png";
const CONTENT_TYPE = "image/png";
const FILE_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const SERVER_ONLY_LOADER = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export%20default%20undefined", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(SERVER_ONLY_LOADER)}`);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const log = (step, details = {}) =>
  process.stdout.write(`${JSON.stringify({ step, at: new Date().toISOString(), ...details })}\n`);

async function countBusinessRows(prisma) {
  const tables = await prisma.$queryRaw`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `;
  let total = 0;
  for (const { tablename } of tables) {
    const escaped = tablename.replaceAll('"', '""');
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM "${EXPECTED_RECIPE_SCHEMA}"."${escaped}"`
    );
    total += rows[0].count;
  }
  return total;
}

async function readDatabaseState(production, recipe) {
  const [
    productionSchema,
    productionUnits,
    productionFiles,
    recipeSchema,
    recipeUnits,
    recipeFiles,
    recipeOrphans,
    businessRows
  ] = await Promise.all([
    production.$queryRaw`SELECT current_schema() AS schema`,
    production.assetUnit.count(),
    production.assetFile.count(),
    recipe.$queryRaw`SELECT current_schema() AS schema`,
    recipe.assetUnit.count(),
    recipe.assetFile.count(),
    recipe.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM "asset_files" f
      LEFT JOIN "asset_units" u ON u."id" = f."asset_unit_id"
      WHERE u."id" IS NULL
    `,
    countBusinessRows(recipe)
  ]);
  const state = {
    production: {
      schema: productionSchema[0]?.schema,
      assetUnits: productionUnits,
      assetFiles: productionFiles
    },
    recipe: {
      schema: recipeSchema[0]?.schema,
      businessRows,
      assetUnits: recipeUnits,
      assetFiles: recipeFiles,
      orphanForeignKeys: recipeOrphans[0]?.count
    }
  };
  if (
    state.production.schema !== EXPECTED_PRODUCTION_SCHEMA ||
    state.production.assetUnits !== 12 ||
    state.production.assetFiles !== 0 ||
    state.recipe.schema !== EXPECTED_RECIPE_SCHEMA ||
    state.recipe.schema === EXPECTED_PRODUCTION_SCHEMA ||
    state.recipe.businessRows !== EXPECTED_BUSINESS_ROWS ||
    state.recipe.assetUnits !== EXPECTED_ASSET_UNITS ||
    state.recipe.assetFiles !== EXPECTED_ASSET_FILES ||
    state.recipe.orphanForeignKeys !== 0
  ) {
    throw new Error("Garde-fou PostgreSQL Phase 10D-E non conforme.");
  }
  return state;
}

async function readBucketState(client) {
  const [bucketResponse, listResponse] = await Promise.all([
    client.request(
      `${client.projectUrl}/storage/v1/bucket/${encodeURIComponent(client.bucketName)}`,
      { headers: client.requestHeaders() }
    ),
    client.request(client.objectListUrl(), {
      method: "POST",
      headers: client.requestHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ prefix: "", limit: 100, offset: 0 })
    })
  ]);
  if (!bucketResponse.ok || !listResponse.ok) {
    throw new Error("Garde-fou Storage Phase 10D-E refuse.");
  }
  const bucket = await bucketResponse.json();
  const objects = await listResponse.json();
  if (
    client.bucketName !== EXPECTED_BUCKET ||
    bucket.public !== false ||
    !Array.isArray(objects)
  ) {
    throw new Error("Garde-fou bucket Phase 10D-E non conforme.");
  }
  return { bucket: client.bucketName, private: true, objectCount: objects.length };
}

async function main() {
  const env = await loadSupabaseEnv();
  if (env.SUPABASE_STORAGE_BUCKET !== EXPECTED_BUCKET) {
    throw new Error("Garde-fou Storage : bucket inattendu.");
  }
  const productionUrl = new URL(env.SUPABASE_DIRECT_URL);
  productionUrl.searchParams.set("schema", EXPECTED_PRODUCTION_SCHEMA);
  const recipeUrl = new URL(env.SUPABASE_DIRECT_URL);
  recipeUrl.searchParams.set("schema", EXPECTED_RECIPE_SCHEMA);
  if (
    productionUrl.searchParams.get("schema") !== EXPECTED_PRODUCTION_SCHEMA ||
    recipeUrl.searchParams.get("schema") !== EXPECTED_RECIPE_SCHEMA ||
    recipeUrl.searchParams.get("schema") === EXPECTED_PRODUCTION_SCHEMA ||
    recipeUrl.port !== "5432" ||
    recipeUrl.searchParams.get("sslmode") !== "require"
  ) {
    throw new Error("Garde-fou de connexion Phase 10D-E non conforme.");
  }

  const production = new ProductionClient({
    datasourceUrl: productionUrl.toString(),
    errorFormat: "minimal"
  });
  const recipe = new RecipeClient({
    datasourceUrl: recipeUrl.toString(),
    errorFormat: "minimal"
  });
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "phase10d-e-signed-url-"));
  const temporaryFile = path.join(temporaryDirectory, FILE_NAME);
  const storageKey = `diagnostics/phase10d-e/${randomUUID()}/${FILE_NAME}`;
  let provider;
  let objectCreated = false;

  try {
    const [
      { createSupabaseStorageAdminClient },
      { SupabaseStorageProvider, waitForObjectAbsence },
      { resolveAssetFileAccess }
    ] = await Promise.all([
      import("../lib/storage/supabase-storage-admin-client.js"),
      import("../lib/storage/supabase-storage-provider.js"),
      import("../lib/storage/asset-file-access.js")
    ]);
    const adminClient = createSupabaseStorageAdminClient({ env, runtime: {} });
    provider = new SupabaseStorageProvider({ adminClient });
    const [initialDatabase, initialBucket] = await Promise.all([
      readDatabaseState(production, recipe),
      readBucketState(adminClient)
    ]);
    if (initialBucket.objectCount !== 0) {
      throw new Error("Garde-fou Storage : bucket non vide.");
    }
    log("guards-validated", { database: initialDatabase, storage: initialBucket });

    await writeFile(temporaryFile, FILE_BYTES, { flag: "wx" });
    const sourceBytes = await readFile(temporaryFile);
    const sourceHash = sha256(sourceBytes);
    const storedObject = await provider.putObject({
      storageKey,
      bytes: sourceBytes,
      contentType: CONTENT_TYPE,
      originalFilename: FILE_NAME,
      size: sourceBytes.length
    });
    objectCreated = true;

    const assetFile = Object.freeze({
      id: "phase10d-e-memory-only",
      storageProvider: "SUPABASE",
      storageBucket: EXPECTED_BUCKET,
      storageKey: storedObject.storageKey,
      filePath: storedObject.filePath
    });
    const access = await resolveAssetFileAccess(assetFile, {
      runtime: {},
      getStorageProvider: () => provider,
      signedUrlTtlSeconds: SIGNED_URL_TTL_SECONDS
    });
    if (
      access.provider !== "SUPABASE" ||
      !(access.expiresAt instanceof Date) ||
      access.expiresAt.getTime() <= Date.now() ||
      assetFile.filePath !== storageKey ||
      assetFile.storageKey !== storageKey
    ) {
      throw new Error("Resolution signee Phase 10D-E non conforme.");
    }

    const download = await fetch(access.url, { redirect: "error" });
    const downloadedBytes = Buffer.from(await download.arrayBuffer());
    if (
      !download.ok ||
      downloadedBytes.length !== sourceBytes.length ||
      sha256(downloadedBytes) !== sourceHash ||
      !downloadedBytes.equals(sourceBytes) ||
      !String(download.headers.get("content-type") || "").startsWith(CONTENT_TYPE)
    ) {
      throw new Error("Lecture signee Phase 10D-E non conforme.");
    }
    log("signed-access-validated", {
      provider: access.provider,
      ttlSeconds: SIGNED_URL_TTL_SECONDS,
      storageKey,
      httpStatus: download.status,
      contentType: download.headers.get("content-type"),
      size: downloadedBytes.length,
      sha256: sourceHash,
      urlPersisted: false
    });

    const deleted = await provider.deleteObject(storageKey);
    if (!deleted) throw new Error("Suppression de l'objet Phase 10D-E non confirmee.");
    objectCreated = false;
    const absence = await waitForObjectAbsence(provider, storageKey);
    if (!absence.absent) throw new Error("Objet Phase 10D-E encore visible.");

    const [finalDatabase, finalBucket] = await Promise.all([
      readDatabaseState(production, recipe),
      readBucketState(adminClient)
    ]);
    if (finalBucket.objectCount !== 0) {
      throw new Error("Bucket non vide apres nettoyage Phase 10D-E.");
    }
    log("completed", {
      success: true,
      database: finalDatabase,
      storage: finalBucket,
      objectAbsent: true,
      temporaryFileRemovedByFinally: true
    });
  } finally {
    if (objectCreated && provider) {
      try {
        await provider.deleteObject(storageKey);
        log("finally-cleanup", { storageKey, deleted: true });
      } catch (error) {
        log("finally-cleanup", {
          storageKey,
          deleted: false,
          errorType: error?.name || "Error"
        });
      }
    }
    await Promise.allSettled([production.$disconnect(), recipe.$disconnect()]);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    step: "failed",
    at: new Date().toISOString(),
    code: typeof error?.code === "string" ? error.code : "PHASE10D_E_FAILED",
    message: String(error?.message || "Erreur inconnue")
      .replace(/postgresql:\/\/[^\s]+/gi, "[CONNECTION_REDACTED]")
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
      .replace(/https?:\/\/[^\s]*token=[^\s]*/gi, "[SIGNED_URL_REDACTED]")
  })}\n`);
  process.exitCode = 1;
});
