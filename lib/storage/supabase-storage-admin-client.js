import "server-only";

import { StorageConfigurationError } from "./errors.js";
import { normalizeStorageKey } from "./storage-key.js";
import { readSupabaseStorageConfiguration } from "./supabase-storage-server-config.js";

export function assertSupabaseStorageServerEnvironment(runtime = globalThis) {
  if (runtime && typeof runtime.window !== "undefined") {
    throw new StorageConfigurationError(
      "Le client administrateur Supabase Storage est reserve au serveur."
    );
  }
}

export function createSupabaseStorageAdminClient({
  env = process.env,
  fetchImplementation = globalThis.fetch,
  runtime = globalThis
} = {}) {
  assertSupabaseStorageServerEnvironment(runtime);
  const configuration = readSupabaseStorageConfiguration(env);
  if (typeof fetchImplementation !== "function") {
    throw new StorageConfigurationError(
      "Le client administrateur Supabase Storage exige une implementation serveur de fetch."
    );
  }

  const encodeKey = (storageKey) =>
    normalizeStorageKey(storageKey).split("/").map(encodeURIComponent).join("/");

  return Object.freeze({
    bucketName: configuration.bucket,
    projectUrl: configuration.url,
    request(url, options) {
      return fetchImplementation(url, options);
    },
    requestHeaders(extra = {}) {
      return {
        apikey: configuration.serviceRoleKey,
        authorization: `Bearer ${configuration.serviceRoleKey}`,
        ...extra
      };
    },
    objectUrl(storageKey, suffix = "object") {
      return `${configuration.url}/storage/v1/${suffix}/${encodeURIComponent(configuration.bucket)}/${encodeKey(storageKey)}`;
    },
    objectListUrl() {
      return `${configuration.url}/storage/v1/object/list/${encodeURIComponent(configuration.bucket)}`;
    }
  });
}

export function createSupabaseStorageAdminClientFactory(options = {}) {
  let client;
  return function getSupabaseStorageAdminClient() {
    client ||= createSupabaseStorageAdminClient(options);
    return client;
  };
}
