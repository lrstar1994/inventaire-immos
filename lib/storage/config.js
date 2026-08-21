import { StorageConfigurationError } from "./errors.js";

export const DEFAULT_STORAGE_PROVIDER = "local";
export const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 300;
export const MIN_SIGNED_URL_EXPIRY_SECONDS = 60;
export const MAX_SIGNED_URL_EXPIRY_SECONDS = 3600;

export function resolveSignedUrlExpirySeconds(
  value = process.env.SUPABASE_STORAGE_SIGNED_URL_TTL_SECONDS
) {
  if (value == null || String(value).trim() === "") {
    return DEFAULT_SIGNED_URL_EXPIRY_SECONDS;
  }
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    throw new StorageConfigurationError(
      "SUPABASE_STORAGE_SIGNED_URL_TTL_SECONDS doit etre un entier."
    );
  }
  const seconds = Number(normalized);
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < MIN_SIGNED_URL_EXPIRY_SECONDS ||
    seconds > MAX_SIGNED_URL_EXPIRY_SECONDS
  ) {
    throw new StorageConfigurationError(
      `SUPABASE_STORAGE_SIGNED_URL_TTL_SECONDS doit etre compris entre ${MIN_SIGNED_URL_EXPIRY_SECONDS} et ${MAX_SIGNED_URL_EXPIRY_SECONDS}.`
    );
  }
  return seconds;
}

export function resolveFileStorageProviderName(
  value = process.env.APP_FILE_STORAGE_PROVIDER,
  databaseProvider = process.env.APP_DATABASE_PROVIDER
) {
  const normalizedDatabaseProvider = String(databaseProvider || "sqlite").trim().toLowerCase();
  const defaultProvider = normalizedDatabaseProvider === "postgresql" ? "supabase" : DEFAULT_STORAGE_PROVIDER;
  const normalized = String(value || defaultProvider).trim().toLowerCase();
  if (normalized !== "local" && normalized !== "supabase") {
    throw new StorageConfigurationError(
      `APP_FILE_STORAGE_PROVIDER invalide : "${normalized}". Valeurs autorisees : local, supabase.`
    );
  }
  if (normalizedDatabaseProvider === "postgresql" && normalized !== "supabase") {
    throw new StorageConfigurationError(
      "Le runtime PostgreSQL exige APP_FILE_STORAGE_PROVIDER=supabase ; le stockage local est interdit."
    );
  }
  return normalized;
}
