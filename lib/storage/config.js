import { StorageConfigurationError } from "./errors.js";

export const DEFAULT_STORAGE_PROVIDER = "local";
export const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 300;

export function resolveFileStorageProviderName(value = process.env.APP_FILE_STORAGE_PROVIDER) {
  const normalized = String(value || DEFAULT_STORAGE_PROVIDER).trim().toLowerCase();
  if (normalized !== "local" && normalized !== "supabase") {
    throw new StorageConfigurationError(
      `APP_FILE_STORAGE_PROVIDER invalide : "${normalized}". Valeurs autorisees : local, supabase.`
    );
  }
  return normalized;
}
