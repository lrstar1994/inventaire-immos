import "server-only";

import { LocalFileStorageProvider } from "./local-file-storage-provider.js";
import { createStorageProviderFactory } from "./storage-provider-factory.js";
import { SupabaseStorageProvider } from "./supabase-storage-provider.js";

const resolveProvider = createStorageProviderFactory({
  createLocal: () => new LocalFileStorageProvider(),
  createSupabase: () => new SupabaseStorageProvider()
});

export function getFileStorageProvider(value = process.env.APP_FILE_STORAGE_PROVIDER) {
  return resolveProvider(value);
}
