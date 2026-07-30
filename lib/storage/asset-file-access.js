import "server-only";

import {
  resolveSignedUrlExpirySeconds
} from "./config.js";
import { StorageProviderError, StorageValidationError } from "./errors.js";
import { getFileStorageProvider } from "./get-file-storage-provider.js";
import { resolveAssetFileStorage } from "./asset-storage-metadata.js";

export function assertAssetFileAccessServerEnvironment(runtime = globalThis) {
  if (runtime && typeof runtime.window !== "undefined") {
    throw new StorageProviderError(
      "La resolution d'acces AssetFile est reservee au serveur."
    );
  }
}

export async function resolveAssetFileAccess(
  assetFile,
  {
    runtime = globalThis,
    getStorageProvider = getFileStorageProvider,
    signedUrlTtlSeconds = resolveSignedUrlExpirySeconds(),
    now = Date.now
  } = {}
) {
  assertAssetFileAccessServerEnvironment(runtime);
  const metadata = resolveAssetFileStorage(assetFile);

  if (metadata.provider === "LOCAL") {
    return Object.freeze({
      provider: "LOCAL",
      url: metadata.filePath,
      expiresAt: null
    });
  }

  const ttlSeconds = resolveSignedUrlExpirySeconds(signedUrlTtlSeconds);
  const storage = getStorageProvider("supabase");
  if (!storage || typeof storage.createSignedDownloadUrl !== "function") {
    throw new StorageProviderError("Provider SUPABASE de resolution indisponible.");
  }
  if (typeof storage.getBucketName !== "function") {
    throw new StorageProviderError("Bucket SUPABASE de resolution indisponible.");
  }
  const configuredBucket = storage.getBucketName();
  if (metadata.bucket !== configuredBucket) {
    throw new StorageValidationError("Bucket AssetFile incoherent avec la configuration Storage.");
  }

  const descriptor = await storage.createSignedDownloadUrl(metadata.key, ttlSeconds);
  if (
    !descriptor ||
    typeof descriptor.url !== "string" ||
    !/^https?:\/\//i.test(descriptor.url)
  ) {
    throw new StorageProviderError("Reponse d'URL signee invalide.");
  }

  return Object.freeze({
    provider: "SUPABASE",
    url: descriptor.url,
    expiresAt: new Date(now() + ttlSeconds * 1000)
  });
}
