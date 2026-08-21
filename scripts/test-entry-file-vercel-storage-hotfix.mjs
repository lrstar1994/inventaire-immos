import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { resolveFileStorageProviderName } from "../lib/storage/config.js";
import { createStorageProviderFactory } from "../lib/storage/storage-provider-factory.js";
import { buildAssetEntryStorageKey, buildAssetUnitStorageKey } from "../lib/storage/storage-key.js";
import { storedObjectToAssetFileData } from "../lib/storage/asset-storage-metadata.js";

const root = process.cwd();
const service = readFileSync(join(root, "lib", "asset-file-service.js"), "utf8");
const localProvider = readFileSync(join(root, "lib", "storage", "local-file-storage-provider.js"), "utf8");

test("PostgreSQL sélectionne Supabase par défaut et refuse LOCAL", () => {
  assert.equal(resolveFileStorageProviderName(undefined, "postgresql"), "supabase");
  assert.equal(resolveFileStorageProviderName("supabase", "postgresql"), "supabase");
  assert.throws(() => resolveFileStorageProviderName("local", "postgresql"), /stockage local est interdit/);
});

test("le provider PostgreSQL n'instancie jamais l'adapter local", () => {
  let localCreations = 0;
  let supabaseCreations = 0;
  const resolve = createStorageProviderFactory({
    createLocal: () => { localCreations += 1; return { name: "local" }; },
    createSupabase: () => { supabaseCreations += 1; return { name: "supabase" }; }
  });
  const previousDatabaseProvider = process.env.APP_DATABASE_PROVIDER;
  const previousStorageProvider = process.env.APP_FILE_STORAGE_PROVIDER;
  process.env.APP_DATABASE_PROVIDER = "postgresql";
  delete process.env.APP_FILE_STORAGE_PROVIDER;
  try {
    assert.equal(resolve(undefined).name, "supabase");
    assert.equal(localCreations, 0);
    assert.equal(supabaseCreations, 1);
  } finally {
    if (previousDatabaseProvider === undefined) delete process.env.APP_DATABASE_PROVIDER;
    else process.env.APP_DATABASE_PROVIDER = previousDatabaseProvider;
    if (previousStorageProvider === undefined) delete process.env.APP_FILE_STORAGE_PROVIDER;
    else process.env.APP_FILE_STORAGE_PROVIDER = previousStorageProvider;
  }
});

test("la clé AssetEntry Supabase reste isolée sous assets/entries", () => {
  assert.equal(
    buildAssetEntryStorageKey({ assetEntryId: "entry-42", fileId: "file-7", extension: ".jpg" }),
    "assets/entries/entry-42/file-7/file-7.jpg"
  );
  assert.equal(buildAssetUnitStorageKey({ assetUnitId: "unit-1", fileId: "file-1", extension: ".png" }), "assets/units/unit-1/file-1/file-1.png");
});

test("les métadonnées Supabase destinées à AssetFile sont conservées", () => {
  assert.deepEqual(storedObjectToAssetFileData({
    provider: "SUPABASE",
    bucket: "asset-files",
    key: "assets/entries/entry-42/file-7/file-7.jpg",
    filePath: "assets/entries/entry-42/file-7/file-7.jpg"
  }), {
    storageProvider: "SUPABASE",
    storageBucket: "asset-files",
    storageKey: "assets/entries/entry-42/file-7/file-7.jpg",
    filePath: "assets/entries/entry-42/file-7/file-7.jpg"
  });
});

test("Entry et Unit partagent le provider et la compensation existants", () => {
  assert.match(service, /const storage = getFileStorageProvider\(\)/);
  assert.match(service, /owner\.type === "entry"[\s\S]*buildAssetEntryStorageKey/);
  assert.match(service, /owner\.type === "entry"[\s\S]*buildAssetUnitStorageKey/);
  assert.match(service, /persistWithStorageCompensation\(\{/);
  assert.match(service, /storageProvider: storageMetadata\.storageProvider/);
  assert.match(service, /storageBucket: storageMetadata\.storageBucket/);
  assert.match(service, /storageKey: storageMetadata\.storageKey/);
});

test("SQLite conserve le provider local existant", () => {
  assert.equal(resolveFileStorageProviderName(undefined, "sqlite"), "local");
  assert.match(localProvider, /mkdir\(path\.dirname\(target\), \{ recursive: true \}\)/);
});
