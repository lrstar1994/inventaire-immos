import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const EXPECTED_SCHEMA = "immos_recipe_phase8";
const EXPECTED_BUCKET = "asset-files";
const EXPECTED_ASSET_UNITS = 13;
const EXPECTED_ASSET_FILES = 0;
const EXPECTED_BUSINESS_ROWS = 253;
const FILE_NAME = "phase10d-d-storage-test.png";
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
      `SELECT COUNT(*)::int AS count FROM "${EXPECTED_SCHEMA}"."${escaped}"`
    );
    total += rows[0].count;
  }
  return total;
}

async function assertRecipeState(prisma, expected = {}) {
  const [schemaRow] = await prisma.$queryRaw`SELECT current_schema() AS schema`;
  const [assetUnits, assetFiles, orphanRows, businessRows] = await Promise.all([
    prisma.assetUnit.count(),
    prisma.assetFile.count(),
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM "asset_files" f
      LEFT JOIN "asset_units" u ON u."id" = f."asset_unit_id"
      WHERE u."id" IS NULL
    `,
    countBusinessRows(prisma)
  ]);
  const state = {
    schema: schemaRow?.schema,
    assetUnits,
    assetFiles,
    orphanForeignKeys: orphanRows[0].count,
    businessRows
  };
  if (state.schema !== EXPECTED_SCHEMA || state.schema === "immos") {
    throw new Error("Garde-fou recette : schema PostgreSQL inattendu.");
  }
  for (const [name, value] of Object.entries(expected)) {
    if (state[name] !== value) {
      throw new Error(`Garde-fou recette : ${name} inattendu.`);
    }
  }
  return state;
}

async function readBucketState(client) {
  const bucketResponse = await client.request(
    `${client.projectUrl}/storage/v1/bucket/${encodeURIComponent(client.bucketName)}`,
    { headers: client.requestHeaders() }
  );
  const listResponse = await client.request(client.objectListUrl(), {
    method: "POST",
    headers: client.requestHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ prefix: "", limit: 100, offset: 0 })
  });
  if (!bucketResponse.ok || !listResponse.ok) {
    throw new Error("Garde-fou Storage : lecture du bucket refusee.");
  }
  const bucket = await bucketResponse.json();
  const objects = await listResponse.json();
  if (client.bucketName !== EXPECTED_BUCKET || bucket.public !== false || !Array.isArray(objects)) {
    throw new Error("Garde-fou Storage : configuration du bucket inattendue.");
  }
  return { bucket: client.bucketName, private: true, objectCount: objects.length };
}

async function main() {
  const env = await loadSupabaseEnv();
  if (env.SUPABASE_STORAGE_BUCKET !== EXPECTED_BUCKET) {
    throw new Error("Garde-fou Storage : bucket inattendu.");
  }
  const recipeUrl = new URL(env.SUPABASE_DIRECT_URL);
  recipeUrl.searchParams.set("schema", EXPECTED_SCHEMA);
  if (recipeUrl.searchParams.get("schema") !== EXPECTED_SCHEMA ||
      recipeUrl.port !== "5432" ||
      recipeUrl.searchParams.get("sslmode") !== "require") {
    throw new Error("Garde-fou recette : connexion directe incompatible.");
  }

  const prisma = new PrismaClient({ datasourceUrl: recipeUrl.toString(), errorFormat: "minimal" });
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "phase10d-d-recipe-"));
  const temporaryFile = path.join(temporaryDirectory, FILE_NAME);
  const runId = randomUUID();
  const temporaryAssetCode = `PHASE10DD-${runId.slice(0, 8).toUpperCase()}`;
  const successFileId = randomUUID();
  const compensationFileId = randomUUID();
  let temporaryAssetUnitId = null;
  let createdAssetFileId = null;
  let provider = null;
  const createdStorageKeys = new Set();
  const cleanup = [];

  try {
    process.env.APP_FILE_STORAGE_PROVIDER = "supabase";
    const [
      { SupabaseStorageProvider, waitForObjectAbsence },
      { createSupabaseStorageAdminClient },
      { buildAssetUnitStorageKey },
      { persistWithStorageCompensation, storedObjectToAssetFileData }
    ] = await Promise.all([
      import("../lib/storage/supabase-storage-provider.js"),
      import("../lib/storage/supabase-storage-admin-client.js"),
      import("../lib/storage/storage-key.js"),
      import("../lib/storage/asset-storage-metadata.js")
    ]);
    const adminClient = createSupabaseStorageAdminClient({ env, runtime: {} });
    provider = new SupabaseStorageProvider({ adminClient });
    if (provider.name !== "supabase" || process.env.APP_FILE_STORAGE_PROVIDER !== "supabase") {
      throw new Error("Garde-fou Storage : provider SUPABASE non explicite.");
    }

    const initialRecipe = await assertRecipeState(prisma, {
      assetUnits: EXPECTED_ASSET_UNITS,
      assetFiles: EXPECTED_ASSET_FILES,
      orphanForeignKeys: 0,
      businessRows: EXPECTED_BUSINESS_ROWS
    });
    const initialBucket = await readBucketState(adminClient);
    if (initialBucket.objectCount !== 0) {
      throw new Error("Garde-fou Storage : bucket non vide.");
    }
    log("guards-validated", { recipe: initialRecipe, storage: initialBucket });

    const [referenceUnit] = await prisma.assetUnit.findMany({
      where: { deletedAt: null },
      orderBy: { id: "asc" },
      take: 1,
      select: { assetItemId: true, locationId: true, condition: true, status: true }
    });
    if (!referenceUnit) throw new Error("Aucune reference recette pour la fixture technique.");
    const temporaryUnit = await prisma.assetUnit.create({
      data: {
        assetCode: temporaryAssetCode,
        assetItemId: referenceUnit.assetItemId,
        locationId: referenceUnit.locationId,
        condition: referenceUnit.condition,
        status: referenceUnit.status,
        notes: "Fixture technique temporaire Phase 10D-D"
      },
      select: { id: true }
    });
    temporaryAssetUnitId = temporaryUnit.id;
    await writeFile(temporaryFile, FILE_BYTES, { flag: "wx" });
    const sourceBytes = await readFile(temporaryFile);
    const sourceHash = sha256(sourceBytes);

    const successKey = buildAssetUnitStorageKey({
      assetUnitId: temporaryAssetUnitId,
      fileId: successFileId,
      extension: ".png"
    });
    createdStorageKeys.add(successKey);
    const storedObject = await provider.putObject({
      storageKey: successKey,
      bytes: sourceBytes,
      contentType: CONTENT_TYPE,
      originalFilename: FILE_NAME,
      size: sourceBytes.length
    });
    const metadata = storedObjectToAssetFileData(storedObject);
    const created = await persistWithStorageCompensation({
      storage: provider,
      storedObject,
      persist: () => prisma.assetFile.create({
        data: {
          assetUnitId: temporaryAssetUnitId,
          fileType: "OTHER",
          fileLabel: "Fixture Phase 10D-D",
          fileName: FILE_NAME,
          filePath: metadata.filePath,
          storageProvider: metadata.storageProvider,
          storageBucket: metadata.storageBucket,
          storageKey: metadata.storageKey,
          mimeType: CONTENT_TYPE,
          fileSize: sourceBytes.length,
          isPrimary: false,
          notes: "Suppression obligatoire en fin de probe"
        }
      })
    });
    createdAssetFileId = created.id;

    const [reloaded, stored] = await Promise.all([
      prisma.assetFile.findUnique({ where: { id: created.id } }),
      provider.getObject(successKey)
    ]);
    if (
      reloaded?.storageProvider !== "SUPABASE" ||
      reloaded.storageBucket !== EXPECTED_BUCKET ||
      reloaded.storageKey !== successKey ||
      reloaded.filePath !== successKey ||
      reloaded.fileName !== FILE_NAME ||
      reloaded.mimeType !== CONTENT_TYPE ||
      reloaded.fileSize !== sourceBytes.length ||
      stored.size !== sourceBytes.length ||
      stored.contentType !== CONTENT_TYPE ||
      sha256(stored.bytes) !== sourceHash ||
      !stored.bytes.equals(sourceBytes)
    ) {
      throw new Error("Validation de l'upload recette non conforme.");
    }
    log("real-upload-validated", {
      assetUnitId: temporaryAssetUnitId,
      assetFileId: created.id,
      storageKey: successKey,
      provider: reloaded.storageProvider,
      bucket: reloaded.storageBucket,
      filePathStable: reloaded.filePath === successKey,
      contentType: stored.contentType,
      size: stored.size,
      sha256: sourceHash
    });

    const compensationKey = buildAssetUnitStorageKey({
      assetUnitId: temporaryAssetUnitId,
      fileId: compensationFileId,
      extension: ".png"
    });
    createdStorageKeys.add(compensationKey);
    const compensationObject = await provider.putObject({
      storageKey: compensationKey,
      bytes: sourceBytes,
      contentType: CONTENT_TYPE,
      originalFilename: FILE_NAME,
      size: sourceBytes.length
    });
    const expectedPersistenceError = new Error("PHASE10D_D_SYNTHETIC_PRISMA_FAILURE");
    await persistWithStorageCompensation({
      storage: provider,
      storedObject: compensationObject,
      persist: async () => {
        throw expectedPersistenceError;
      }
    }).then(
      () => { throw new Error("La persistance synthetique devait echouer."); },
      (error) => {
        if (error !== expectedPersistenceError) {
          throw new Error("L'erreur Prisma synthetique n'a pas ete conservee.");
        }
      }
    );
    createdStorageKeys.delete(compensationKey);
    const compensationAbsent = await waitForObjectAbsence(provider, compensationKey);
    if (!compensationAbsent.absent) throw new Error("La compensation Storage a echoue.");
    const matchingRows = await prisma.assetFile.count({ where: { storageKey: compensationKey } });
    if (matchingRows !== 0) throw new Error("Une ligne AssetFile de compensation a persiste.");
    log("real-compensation-validated", {
      storageKey: compensationKey,
      objectAbsent: true,
      matchingAssetFiles: matchingRows,
      attempts: compensationAbsent.attempts
    });

    await prisma.assetFile.delete({ where: { id: createdAssetFileId } });
    createdAssetFileId = null;
    const deleted = await provider.deleteObject(successKey);
    if (!deleted) throw new Error("L'objet du scenario principal n'a pas ete supprime.");
    createdStorageKeys.delete(successKey);
    const successAbsent = await waitForObjectAbsence(provider, successKey);
    if (!successAbsent.absent) throw new Error("L'objet principal reste visible.");
    await prisma.assetUnit.delete({ where: { id: temporaryAssetUnitId } });
    temporaryAssetUnitId = null;

    const finalRecipe = await assertRecipeState(prisma, {
      assetUnits: EXPECTED_ASSET_UNITS,
      assetFiles: EXPECTED_ASSET_FILES,
      orphanForeignKeys: 0,
      businessRows: EXPECTED_BUSINESS_ROWS
    });
    const finalBucket = await readBucketState(adminClient);
    if (finalBucket.objectCount !== 0) throw new Error("Le bucket n'est pas vide apres nettoyage.");
    log("completed", {
      success: true,
      recipe: finalRecipe,
      storage: finalBucket,
      temporaryFileRemovedByFinally: true
    });
  } finally {
    if (provider) {
      for (const storageKey of createdStorageKeys) {
        try {
          const deleted = await provider.deleteObject(storageKey);
          cleanup.push({ type: "storage", storageKey, deleted });
        } catch (error) {
          cleanup.push({ type: "storage", storageKey, errorType: error?.name || "Error" });
        }
      }
    }
    if (createdAssetFileId) {
      try {
        await prisma.assetFile.delete({ where: { id: createdAssetFileId } });
        cleanup.push({ type: "assetFile", id: createdAssetFileId, deleted: true });
      } catch (error) {
        cleanup.push({ type: "assetFile", id: createdAssetFileId, errorType: error?.name || "Error" });
      }
    }
    if (temporaryAssetUnitId) {
      try {
        await prisma.assetUnit.delete({ where: { id: temporaryAssetUnitId } });
        cleanup.push({ type: "assetUnit", id: temporaryAssetUnitId, deleted: true });
      } catch (error) {
        cleanup.push({ type: "assetUnit", id: temporaryAssetUnitId, errorType: error?.name || "Error" });
      }
    }
    await prisma.$disconnect();
    await rm(temporaryDirectory, { recursive: true, force: true });
    if (cleanup.length) log("finally-cleanup", { operations: cleanup });
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    step: "failed",
    at: new Date().toISOString(),
    code: typeof error?.code === "string" ? error.code : "PHASE10D_D_FAILED",
    message: String(error?.message || "Erreur inconnue")
      .replace(/postgresql:\/\/[^\s]+/gi, "[CONNECTION_REDACTED]")
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
  })}\n`);
  process.exitCode = 1;
});
