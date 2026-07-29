import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_SIGNED_URL_EXPIRY_SECONDS,
  resolveFileStorageProviderName
} from "../lib/storage/config.js";
import {
  buildAssetUnitStorageKey,
  normalizeFileExtension,
  normalizeStorageKey
} from "../lib/storage/storage-key.js";
import { createStorageProviderFactory } from "../lib/storage/storage-provider-factory.js";

test("le provider par defaut et la selection explicite sont controles", () => {
  assert.equal(resolveFileStorageProviderName(undefined), "local");
  assert.equal(resolveFileStorageProviderName("local"), "local");
  assert.equal(resolveFileStorageProviderName("supabase"), "supabase");
  assert.throws(() => resolveFileStorageProviderName("unknown"), /APP_FILE_STORAGE_PROVIDER invalide/);
});

test("la factory n'initialise pas Supabase en mode local", () => {
  let localCalls = 0;
  let supabaseCalls = 0;
  const getProvider = createStorageProviderFactory({
    createLocal: () => ({ name: "local", call: ++localCalls }),
    createSupabase: () => ({ name: "supabase", call: ++supabaseCalls })
  });
  assert.equal(getProvider().name, "local");
  assert.equal(localCalls, 1);
  assert.equal(supabaseCalls, 0);
  assert.equal(getProvider("supabase").name, "supabase");
  assert.equal(supabaseCalls, 1);
});

test("la cle Storage est deterministe et n'utilise pas le nom original", () => {
  assert.equal(
    buildAssetUnitStorageKey({ assetUnitId: "unit_123", fileId: "file_456", extension: ".JPG" }),
    "assets/units/unit_123/file_456/file_456.jpg"
  );
});

test("les identifiants injectes et extensions interdites sont rejetes", () => {
  assert.throws(
    () => buildAssetUnitStorageKey({ assetUnitId: "../unit", fileId: "file", extension: "jpg" }),
    /assetUnitId/
  );
  assert.throws(
    () => buildAssetUnitStorageKey({ assetUnitId: "unit/path", fileId: "file", extension: "jpg" }),
    /assetUnitId/
  );
  assert.throws(
    () => buildAssetUnitStorageKey({ assetUnitId: "unit", fileId: "C:\\file", extension: "jpg" }),
    /fileId/
  );
  assert.throws(() => normalizeFileExtension("exe"), /Extension/);
});

test("les cles absolues et traversals sont rejetes", () => {
  assert.throws(() => normalizeStorageKey("../secret.pdf"), /Cle de stockage/);
  assert.throws(() => normalizeStorageKey("/absolute/file.pdf"), /absolue/);
  assert.throws(() => normalizeStorageKey("C:\\absolute\\file.pdf"), /absolue/);
});

test("les URL signees expirent par defaut apres cinq minutes", () => {
  assert.equal(DEFAULT_SIGNED_URL_EXPIRY_SECONDS, 300);
});

test("le provider Supabase reste serveur, paresseux et sans URL publique", async () => {
  const source = await readFile(new URL("../lib/storage/supabase-storage-provider.js", import.meta.url), "utf8");
  assert.match(source, /^import "server-only";/);
  assert.match(source, /this\.configuration = null/);
  assert.match(source, /createSignedDownloadUrl\(storageKey, expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRY_SECONDS\)/);
  assert.doesNotMatch(source, /getPublicUrl/);
  assert.doesNotMatch(source, /console\.(log|error|warn)/);
});

test("la factory concrete n'effectue aucune operation Storage au chargement", async () => {
  const source = await readFile(new URL("../lib/storage/get-file-storage-provider.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.(putObject|deleteObject|createSignedDownloadUrl)\(/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
});
