import { StorageConfigurationError } from "./errors.js";

export const DEFAULT_STORAGE_PROVIDER = "local";
export const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 300;
export const DEFAULT_STORAGE_BUCKET = "asset-files";

export function resolveFileStorageProviderName(value = process.env.APP_FILE_STORAGE_PROVIDER) {
  const normalized = String(value || DEFAULT_STORAGE_PROVIDER).trim().toLowerCase();
  if (normalized !== "local" && normalized !== "supabase") {
    throw new StorageConfigurationError(
      `APP_FILE_STORAGE_PROVIDER invalide : "${normalized}". Valeurs autorisees : local, supabase.`
    );
  }
  return normalized;
}

export function readSupabaseStorageConfiguration(env = process.env) {
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const bucket = String(env.SUPABASE_STORAGE_BUCKET || DEFAULT_STORAGE_BUCKET).trim();
  if (!url || !serviceRoleKey || !bucket) {
    throw new StorageConfigurationError(
      "Le stockage Supabase exige NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et SUPABASE_STORAGE_BUCKET."
    );
  }
  return { url: url.replace(/\/+$/, ""), serviceRoleKey, bucket };
}
