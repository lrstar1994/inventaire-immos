import "server-only";

import path from "node:path";
import { lstat, realpath, unlink } from "node:fs/promises";
import { normalizeStorageKey } from "./storage-key.js";
import { resolveAssetFileStorage } from "./asset-storage-metadata.js";

export const ASSET_FILE_PURGE_MODES = Object.freeze({
  DRY_RUN: "DRY_RUN",
  EXECUTE: "EXECUTE"
});

export const ASSET_FILE_RETENTION_DAYS = 30;
export const ASSET_FILE_RETENTION_MS =
  ASSET_FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const LOCAL_PUBLIC_PREFIX = "/uploads/assets/";
const ASSET_FILE_SELECT = Object.freeze({
  id: true,
  deletedAt: true,
  updatedAt: true,
  storageProvider: true,
  storageBucket: true,
  storageKey: true,
  filePath: true
});

export const PROTECTED_HISTORICAL_LOCAL_FILES = Object.freeze([
  Object.freeze({
    key: "LIT-KING-000002/LIT-KING-000002-8294b002-602f-4e5f-9d47-66fbb469e0ec-133828107271725621.jpg",
    sha256: "4ea6fafc0e1dfec5b1763203715f20c00b2b84720c8ff9158a47a06c440fad4a"
  }),
  Object.freeze({
    key: "LIT-KING-000002/LIT-KING-000002-833c4964-8f75-4b4a-a13e-cdb6ab9aaca2-133879581908740101.jpg",
    sha256: "ff1a9c1a9ccf30932426389687755d2065074eacaa56948451e03903dac3bd83"
  }),
  Object.freeze({
    key: "LIT-KING-000002/LIT-KING-000002-f1b9b68c-989d-405e-9802-1c246e352791-133810434509723163.jpg",
    sha256: "d360445ca40c9e7c6afc77bc7d97a2c30c9f58b766cfb5de50db422bd5d393ec"
  })
]);

const PROTECTED_LOCAL_KEYS = new Set(
  PROTECTED_HISTORICAL_LOCAL_FILES.map(({ key }) => key)
);

export class AssetFilePurgeError extends Error {
  constructor(status, result, options) {
    super(`Purge AssetFile interrompue (${status}).`, options);
    this.name = "AssetFilePurgeError";
    this.status = status;
    this.result = result;
  }
}

function resultFor({
  assetFileId,
  mode,
  eligible = false,
  status,
  provider = null,
  deletedAt = null,
  retentionDeadline = null,
  sharedReferenceCount = 0,
  binaryState = "not_checked",
  databaseState = "retained",
  actionTaken = "none"
}) {
  return {
    assetFileId,
    mode,
    eligible,
    status,
    provider,
    deletedAt,
    retentionDeadline,
    sharedReferenceCount,
    binaryState,
    databaseState,
    actionTaken
  };
}

function parseInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Une entree de purge est requise.");
  }
  const unexpected = Object.keys(input).filter(
    (key) => key !== "assetFileId" && key !== "mode"
  );
  if (unexpected.length > 0) {
    throw new TypeError("La purge accepte uniquement assetFileId et mode.");
  }
  const assetFileId = String(input.assetFileId || "").trim();
  if (!assetFileId) throw new TypeError("assetFileId est obligatoire.");
  const mode = input.mode ?? ASSET_FILE_PURGE_MODES.DRY_RUN;
  if (!Object.values(ASSET_FILE_PURGE_MODES).includes(mode)) {
    throw new TypeError("Mode de purge invalide.");
  }
  return { assetFileId, mode };
}

function dateValue(value) {
  if (value == null) return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function localKeyFor(storage) {
  const key = storage.key ??
    storage.filePath.slice(LOCAL_PUBLIC_PREFIX.length);
  return normalizeStorageKey(key);
}

function describeStorage(assetFile, expectedSupabaseBucket) {
  const rawProvider = assetFile.storageProvider == null
    ? null
    : String(assetFile.storageProvider).toUpperCase();
  if (rawProvider !== null && rawProvider !== "LOCAL" && rawProvider !== "SUPABASE") {
    return { status: "invalid_provider" };
  }
  try {
    const storage = resolveAssetFileStorage(assetFile);
    if (storage.provider === "LOCAL") {
      const key = localKeyFor(storage);
      return {
        storage,
        provider: "LOCAL",
        identity: `LOCAL:${key}`,
        key,
        protected: PROTECTED_LOCAL_KEYS.has(key)
      };
    }
    const expectedBucket = String(expectedSupabaseBucket || "").trim();
    if (!expectedBucket || storage.bucket !== expectedBucket) {
      return { status: "invalid_metadata" };
    }
    if (
      String(assetFile.storageKey).includes("\\") ||
      /[?#]/.test(storage.key) ||
      /^[a-z][a-z0-9+.-]*:/i.test(storage.key)
    ) {
      return { status: "invalid_metadata" };
    }
    return {
      storage,
      provider: "SUPABASE",
      identity: `SUPABASE:${storage.bucket}:${storage.key}`,
      key: storage.key,
      bucket: storage.bucket,
      protected: false
    };
  } catch {
    return { status: "invalid_metadata" };
  }
}

function sensitiveSnapshot(row) {
  return JSON.stringify({
    id: row.id,
    deletedAt: dateValue(row.deletedAt)?.toISOString() ?? null,
    updatedAt: dateValue(row.updatedAt)?.toISOString() ?? null,
    storageProvider: row.storageProvider ?? null,
    storageBucket: row.storageBucket ?? null,
    storageKey: row.storageKey ?? null,
    filePath: row.filePath ?? null
  });
}

function evaluateRow(row, { assetFileId, mode, now, expectedSupabaseBucket }) {
  if (!row) return resultFor({ assetFileId, mode, status: "asset_file_not_found" });
  const deletedAt = dateValue(row.deletedAt);
  if (row.deletedAt == null) {
    return resultFor({ assetFileId, mode, status: "not_deleted" });
  }
  if (!deletedAt) {
    return resultFor({ assetFileId, mode, status: "invalid_metadata" });
  }
  const retentionDeadlineDate = new Date(deletedAt.getTime() + ASSET_FILE_RETENTION_MS);
  const common = {
    assetFileId,
    mode,
    deletedAt: deletedAt.toISOString(),
    retentionDeadline: retentionDeadlineDate.toISOString()
  };
  if (retentionDeadlineDate.getTime() > now.getTime()) {
    return resultFor({ ...common, status: "retention_not_elapsed" });
  }
  const descriptor = describeStorage(row, expectedSupabaseBucket);
  if (descriptor.status) {
    return resultFor({ ...common, status: descriptor.status });
  }
  if (descriptor.protected) {
    return resultFor({
      ...common,
      provider: descriptor.provider,
      status: "protected_historical_file"
    });
  }
  return {
    result: resultFor({
      ...common,
      provider: descriptor.provider,
      eligible: true,
      status: "eligible"
    }),
    descriptor
  };
}

function identityForCandidate(candidate, expectedSupabaseBucket) {
  const described = describeStorage(candidate, expectedSupabaseBucket);
  return described.status || described.protected ? null : described.identity;
}

async function sharedReferenceCount({
  prismaClient,
  assetFileId,
  identity,
  expectedSupabaseBucket
}) {
  const candidates = await prismaClient.assetFile.findMany({
    where: { id: { not: assetFileId } },
    select: {
      id: true,
      storageProvider: true,
      storageBucket: true,
      storageKey: true,
      filePath: true
    }
  });
  return candidates.reduce(
    (count, candidate) =>
      count + (identityForCandidate(candidate, expectedSupabaseBucket) === identity ? 1 : 0),
    0
  );
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." && !path.isAbsolute(relative);
}

function missingFilesystemEntry(error) {
  return error?.code === "ENOENT";
}

export function createSafeLocalBinaryOperations({
  rootDirectory = path.join(process.cwd(), "public", "uploads", "assets")
} = {}) {
  const root = path.resolve(rootDirectory);

  async function inspect(key) {
    const normalized = normalizeStorageKey(key);
    const target = path.resolve(root, ...normalized.split("/"));
    if (!isInside(root, target)) throw new Error("Cible LOCAL hors racine.");
    try {
      const entry = await lstat(target);
      if (entry.isSymbolicLink()) throw new Error("Lien symbolique LOCAL interdit.");
      if (!entry.isFile()) throw new Error("La cible LOCAL n'est pas un fichier.");
      const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
      if (!isInside(realRoot, realTarget)) throw new Error("Cible LOCAL hors racine reelle.");
      return { exists: true, normalizedKey: normalized };
    } catch (error) {
      if (missingFilesystemEntry(error)) return { exists: false, normalizedKey: normalized };
      throw error;
    }
  }

  return {
    inspect,
    async delete(key) {
      const state = await inspect(key);
      if (!state.exists) return false;
      try {
        await unlink(path.resolve(root, ...state.normalizedKey.split("/")));
        return true;
      } catch (error) {
        if (missingFilesystemEntry(error)) return false;
        throw error;
      }
    }
  };
}

async function defaultPrismaClient() {
  const { prisma } = await import("../prisma.js");
  return prisma;
}

function deleteWhere(row) {
  return {
    id: row.id,
    deletedAt: dateValue(row.deletedAt),
    updatedAt: dateValue(row.updatedAt),
    storageProvider: row.storageProvider ?? null,
    storageBucket: row.storageBucket ?? null,
    storageKey: row.storageKey ?? null,
    filePath: row.filePath
  };
}

function failureResult(base, status, binaryState, databaseState = "retained") {
  return {
    ...base,
    eligible: false,
    status,
    binaryState,
    databaseState,
    actionTaken: "none"
  };
}

export async function checkSupabaseObjectExistence(provider, storageKey) {
  if (!provider || typeof provider.isObjectListed !== "function") {
    return { state: "unknown", cause: null };
  }
  try {
    return {
      state: await provider.isObjectListed(storageKey) ? "exists" : "missing",
      cause: null
    };
  } catch (cause) {
    return { state: "unknown", cause };
  }
}

export async function processDeferredAssetFilePurge(input, injected = {}) {
  const { assetFileId, mode } = parseInput(input);
  const prismaClient = injected.prismaClient ?? await defaultPrismaClient();
  const nowValue = typeof injected.now === "function" ? injected.now() : new Date();
  const now = dateValue(nowValue);
  if (!now) throw new TypeError("Horloge de purge invalide.");
  const expectedSupabaseBucket =
    injected.expectedSupabaseBucket ?? process.env.SUPABASE_STORAGE_BUCKET;
  const localBinary = injected.localBinary ?? createSafeLocalBinaryOperations();

  const firstRow = await prismaClient.assetFile.findUnique({
    where: { id: assetFileId },
    select: ASSET_FILE_SELECT
  });
  const firstEvaluation = evaluateRow(firstRow, {
    assetFileId,
    mode,
    now,
    expectedSupabaseBucket
  });
  if (!firstEvaluation.result) return firstEvaluation;

  const firstSharedCount = await sharedReferenceCount({
    prismaClient,
    assetFileId,
    identity: firstEvaluation.descriptor.identity,
    expectedSupabaseBucket
  });
  if (firstSharedCount > 0) {
    return {
      ...firstEvaluation.result,
      eligible: false,
      status: "shared_reference_detected",
      sharedReferenceCount: firstSharedCount
    };
  }

  if (firstEvaluation.descriptor.provider === "LOCAL") {
    try {
      await localBinary.inspect(firstEvaluation.descriptor.key);
    } catch {
      return failureResult(firstEvaluation.result, "invalid_metadata", "not_checked");
    }
  }

  if (mode === ASSET_FILE_PURGE_MODES.DRY_RUN) {
    return {
      ...firstEvaluation.result,
      status: "dry_run_complete",
      actionTaken: "none"
    };
  }

  const secondRow = await prismaClient.assetFile.findUnique({
    where: { id: assetFileId },
    select: ASSET_FILE_SELECT
  });
  const secondEvaluation = evaluateRow(secondRow, {
    assetFileId,
    mode,
    now,
    expectedSupabaseBucket
  });
  if (!secondEvaluation.result) return secondEvaluation;
  if (sensitiveSnapshot(firstRow) !== sensitiveSnapshot(secondRow)) {
    return failureResult(secondEvaluation.result, "invalid_metadata", "not_checked");
  }
  const secondSharedCount = await sharedReferenceCount({
    prismaClient,
    assetFileId,
    identity: secondEvaluation.descriptor.identity,
    expectedSupabaseBucket
  });
  if (secondSharedCount > 0) {
    return {
      ...secondEvaluation.result,
      eligible: false,
      status: "shared_reference_detected",
      sharedReferenceCount: secondSharedCount
    };
  }

  let deleted;
  try {
    if (secondEvaluation.descriptor.provider === "LOCAL") {
      deleted = await localBinary.delete(secondEvaluation.descriptor.key);
    } else {
      const supabaseProvider = injected.supabaseProvider ??
        injected.getSupabaseProvider?.() ??
        (await import("./get-file-storage-provider.js"))
          .getFileStorageProvider("supabase");
      if (
        typeof supabaseProvider.getBucketName === "function" &&
        supabaseProvider.getBucketName() !== secondEvaluation.descriptor.bucket
      ) {
        throw new Error("Bucket SUPABASE incoherent.");
      }
      const beforeDelete = await checkSupabaseObjectExistence(
        supabaseProvider,
        secondEvaluation.descriptor.key
      );
      if (beforeDelete.state === "missing") {
        deleted = false;
      } else {
        try {
          deleted = await supabaseProvider.deleteObject(secondEvaluation.descriptor.key);
        } catch (deleteCause) {
          const afterDelete = await checkSupabaseObjectExistence(
            supabaseProvider,
            secondEvaluation.descriptor.key
          );
          if (afterDelete.state === "missing") {
            deleted = false;
          } else {
            throw deleteCause;
          }
        }
      }
    }
  } catch (cause) {
    const result = failureResult(
      secondEvaluation.result,
      "binary_delete_failed",
      "binary_delete_failed"
    );
    throw new AssetFilePurgeError("binary_delete_failed", result, { cause });
  }

  const binaryState = deleted ? "binary_deleted" : "binary_already_missing";
  let deletion;
  try {
    deletion = await prismaClient.assetFile.deleteMany({ where: deleteWhere(secondRow) });
  } catch (cause) {
    const result = failureResult(
      secondEvaluation.result,
      "database_delete_failed",
      binaryState
    );
    throw new AssetFilePurgeError("database_delete_failed", result, { cause });
  }
  if (deletion?.count !== 1) {
    const result = failureResult(
      secondEvaluation.result,
      "database_delete_failed",
      binaryState
    );
    throw new AssetFilePurgeError("database_delete_failed", result);
  }

  return {
    ...secondEvaluation.result,
    status: "purge_complete",
    binaryState,
    databaseState: "database_row_deleted",
    actionTaken: "binary_and_database_row_deleted"
  };
}
