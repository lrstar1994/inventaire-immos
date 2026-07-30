import "server-only";

import { StorageConfigurationError } from "./errors.js";

const REQUIRED_VARIABLES = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET"
]);

function readRequiredVariable(env, name) {
  const value = String(env?.[name] || "").trim();
  if (!value) {
    throw new StorageConfigurationError(`Configuration Storage manquante : ${name}.`);
  }
  return value;
}

function normalizeSupabaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new StorageConfigurationError(
      "Configuration Storage invalide : NEXT_PUBLIC_SUPABASE_URL doit etre une URL HTTP(S)."
    );
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new StorageConfigurationError(
      "Configuration Storage invalide : NEXT_PUBLIC_SUPABASE_URL doit etre une URL HTTP(S) sans identifiants."
    );
  }
  return value.replace(/\/+$/, "");
}

function normalizeBucketName(value) {
  if (
    value.startsWith("/") ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("..") ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
  ) {
    throw new StorageConfigurationError(
      "Configuration Storage invalide : SUPABASE_STORAGE_BUCKET doit etre un nom de bucket relatif."
    );
  }
  return value;
}

export function readSupabaseStorageConfiguration(env = process.env) {
  const [url, serviceRoleKey, bucket] = REQUIRED_VARIABLES.map((name) =>
    readRequiredVariable(env, name)
  );
  return Object.freeze({
    url: normalizeSupabaseUrl(url),
    serviceRoleKey,
    bucket: normalizeBucketName(bucket)
  });
}
