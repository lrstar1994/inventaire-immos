import { StorageValidationError } from "./errors.js";
import { normalizeStorageKey } from "./storage-key.js";

const LOCAL_PUBLIC_PREFIX = "/uploads/assets/";
const PROVIDERS = new Set(["LOCAL", "SUPABASE"]);

function invalidMetadata(message) {
  return new StorageValidationError(`Metadonnees Storage invalides : ${message}`);
}

function requireStableFilePath(value) {
  const filePath = String(value || "").trim();
  if (!filePath) throw invalidMetadata("filePath est obligatoire.");
  return filePath;
}

export function storedObjectToAssetFileData(storedObject) {
  const provider = String(storedObject?.provider || "").toUpperCase();
  if (!PROVIDERS.has(provider)) throw invalidMetadata("provider inconnu.");

  const storageKey = normalizeStorageKey(storedObject?.key ?? storedObject?.storageKey);
  const storageBucket = storedObject?.bucket == null ? null : String(storedObject.bucket).trim();
  const filePath = requireStableFilePath(storedObject?.filePath ?? storedObject?.databasePath);

  if (provider === "LOCAL" && storageBucket !== null) {
    throw invalidMetadata("LOCAL ne doit pas avoir de bucket.");
  }
  if (provider === "LOCAL" && filePath !== `${LOCAL_PUBLIC_PREFIX}${storageKey}`) {
    throw invalidMetadata("filePath LOCAL ne correspond pas a storageKey.");
  }
  if (provider === "SUPABASE" && !storageBucket) {
    throw invalidMetadata("SUPABASE exige un bucket.");
  }

  return {
    storageProvider: provider,
    storageBucket,
    storageKey,
    filePath
  };
}

export function resolveAssetFileStorage(assetFile) {
  const provider = assetFile?.storageProvider == null
    ? null
    : String(assetFile.storageProvider).toUpperCase();
  const rawKey = assetFile?.storageKey == null
    ? null
    : String(assetFile.storageKey).trim();
  const bucket = assetFile?.storageBucket == null
    ? null
    : String(assetFile.storageBucket).trim();
  const key = rawKey == null ? null : normalizeStorageKey(rawKey);
  const filePath = requireStableFilePath(assetFile?.filePath);

  if (provider === null) {
    if (bucket !== null || key !== null || !filePath.startsWith(LOCAL_PUBLIC_PREFIX)) {
      throw invalidMetadata("ancien fichier LOCAL incoherent.");
    }
    normalizeStorageKey(filePath.slice(LOCAL_PUBLIC_PREFIX.length));
    return { provider: "LOCAL", bucket: null, key: null, filePath, legacy: true };
  }

  if (provider === "LOCAL") {
    if (bucket !== null || key === null || filePath !== `${LOCAL_PUBLIC_PREFIX}${key}`) {
      throw invalidMetadata("fichier LOCAL incoherent.");
    }
    return { provider, bucket: null, key, filePath, legacy: false };
  }

  if (provider === "SUPABASE") {
    if (!bucket || key === null) throw invalidMetadata("fichier SUPABASE incomplet.");
    if (rawKey.includes("\\")) throw invalidMetadata("storageKey SUPABASE invalide.");
    if (filePath !== key) throw invalidMetadata("filePath SUPABASE ne correspond pas a storageKey.");
    return { provider, bucket, key, filePath, legacy: false };
  }

  throw invalidMetadata("provider inconnu.");
}

export async function persistWithStorageCompensation({
  storage,
  storedObject,
  persist,
  logCompensationFailure = (details) => console.error("Storage compensation failed", details)
}) {
  if (!storage || typeof storage.deleteObject !== "function") {
    throw new TypeError("Un provider Storage supprimable est requis.");
  }
  if (typeof persist !== "function") throw new TypeError("Une fonction de persistance est requise.");
  const metadata = storedObjectToAssetFileData(storedObject);

  try {
    return await persist();
  } catch (persistenceError) {
    try {
      await storage.deleteObject(metadata.storageKey);
    } catch (compensationError) {
      logCompensationFailure({
        provider: metadata.storageProvider,
        bucket: metadata.storageBucket,
        storageKey: metadata.storageKey,
        errorType: compensationError?.name || "Error"
      });
    }
    throw persistenceError;
  }
}
