import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
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
import {
  persistWithStorageCompensation,
  resolveAssetFileStorage,
  storedObjectToAssetFileData
} from "../lib/storage/asset-storage-metadata.js";

const SERVER_ONLY_LOADER = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export%20default%20undefined", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(SERVER_ONLY_LOADER)}`);

async function createMockedSupabaseProvider(responses) {
  const calls = [];
  const { SupabaseStorageProvider } = await import("../lib/storage/supabase-storage-provider.js");
  const provider = new SupabaseStorageProvider({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "test-only-secret",
      SUPABASE_STORAGE_BUCKET: "asset-files"
    },
    fetchImplementation: async (url, options = {}) => {
      calls.push({
        url,
        method: options.method || "GET",
        headers: options.headers || {},
        body: options.body
      });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    }
  });
  return { provider, calls };
}

test("le provider par defaut et la selection explicite sont controles", () => {
  assert.equal(resolveFileStorageProviderName(undefined), "local");
  assert.equal(resolveFileStorageProviderName("local"), "local");
  assert.equal(resolveFileStorageProviderName("supabase"), "supabase");
  assert.throws(() => resolveFileStorageProviderName("unknown"), /APP_FILE_STORAGE_PROVIDER invalide/);
});

test("la configuration Supabase valide est normalisee sans valeur implicite", async () => {
  const { readSupabaseStorageConfiguration } = await import(
    "../lib/storage/supabase-storage-server-config.js"
  );
  const configuration = readSupabaseStorageConfiguration({
    NEXT_PUBLIC_SUPABASE_URL: " https://example.invalid/ ",
    SUPABASE_SERVICE_ROLE_KEY: " test-service-role ",
    SUPABASE_STORAGE_BUCKET: " asset-files "
  });
  assert.deepEqual(configuration, {
    url: "https://example.invalid",
    serviceRoleKey: "test-service-role",
    bucket: "asset-files"
  });
  assert.equal(Object.isFrozen(configuration), true);
});

test("chaque variable Supabase serveur obligatoire est controlee separement", async () => {
  const { readSupabaseStorageConfiguration } = await import(
    "../lib/storage/supabase-storage-server-config.js"
  );
  const valid = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
    SUPABASE_STORAGE_BUCKET: "asset-files"
  };
  for (const name of Object.keys(valid)) {
    assert.throws(
      () => readSupabaseStorageConfiguration({ ...valid, [name]: "" }),
      new RegExp(name)
    );
  }
});

test("les URL Supabase non HTTP(S) ou avec identifiants sont rejetees", async () => {
  const { readSupabaseStorageConfiguration } = await import(
    "../lib/storage/supabase-storage-server-config.js"
  );
  for (const url of ["not-a-url", "ftp://example.invalid", "https://user:pass@example.invalid"]) {
    assert.throws(
      () => readSupabaseStorageConfiguration({
        NEXT_PUBLIC_SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
        SUPABASE_STORAGE_BUCKET: "asset-files"
      }),
      /URL HTTP\(S\)/
    );
  }
});

test("les noms de bucket dangereux sont rejetes", async () => {
  const { readSupabaseStorageConfiguration } = await import(
    "../lib/storage/supabase-storage-server-config.js"
  );
  for (const bucket of ["/asset-files", "../asset-files", "asset/files", "asset\\files"]) {
    assert.throws(
      () => readSupabaseStorageConfiguration({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
        SUPABASE_STORAGE_BUCKET: bucket
      }),
      /nom de bucket relatif/
    );
  }
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

test("le resultat LOCAL canonique fournit les metadonnees persistables", () => {
  const data = storedObjectToAssetFileData({
    provider: "LOCAL",
    bucket: null,
    key: "ABC/ABC-uuid-photo.jpg",
    filePath: "/uploads/assets/ABC/ABC-uuid-photo.jpg"
  });
  assert.deepEqual(data, {
    storageProvider: "LOCAL",
    storageBucket: null,
    storageKey: "ABC/ABC-uuid-photo.jpg",
    filePath: "/uploads/assets/ABC/ABC-uuid-photo.jpg"
  });
  assert.equal(data.storageKey.split("/").at(-1), "ABC-uuid-photo.jpg");
});

test("le provider LOCAL retourne le contrat canonique sans toucher au dossier public", async () => {
  const { LocalFileStorageProvider } = await import("../lib/storage/local-file-storage-provider.js");
  const rootDirectory = await mkdtemp(path.join(tmpdir(), "phase10d-b-local-"));
  const provider = new LocalFileStorageProvider({ rootDirectory });
  try {
    const bytes = Buffer.from("%PDF-test", "ascii");
    const result = await provider.putObject({
      storageKey: "ABC/ABC-uuid-document.pdf",
      bytes,
      contentType: "application/pdf",
      originalFilename: "document.pdf",
      size: bytes.length
    });
    assert.equal(result.provider, "LOCAL");
    assert.equal(result.bucket, null);
    assert.equal(result.key, "ABC/ABC-uuid-document.pdf");
    assert.equal(result.storageKey, result.key);
    assert.equal(result.filePath, "/uploads/assets/ABC/ABC-uuid-document.pdf");
    assert.equal(result.databasePath, result.filePath);
    assert.equal(await provider.objectExists(result.key), true);
    assert.equal(await provider.deleteObject(result.key), true);
    assert.equal(await provider.objectExists(result.key), false);
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test("une ancienne ligne locale sans metadonnees reste reconnue", () => {
  assert.deepEqual(
    resolveAssetFileStorage({
      storageProvider: null,
      storageBucket: null,
      storageKey: null,
      filePath: "/uploads/assets/ABC/legacy.jpg"
    }),
    {
      provider: "LOCAL",
      bucket: null,
      key: null,
      filePath: "/uploads/assets/ABC/legacy.jpg",
      legacy: true
    }
  );
});

test("les etats de metadonnees Storage incoherents sont rejetes", () => {
  assert.throws(
    () => resolveAssetFileStorage({
      storageProvider: "SUPABASE",
      storageBucket: null,
      storageKey: "assets/file.jpg",
      filePath: "assets/file.jpg"
    }),
    /SUPABASE incomplet/
  );
  assert.throws(
    () => resolveAssetFileStorage({
      storageProvider: "SUPABASE",
      storageBucket: "asset-files",
      storageKey: null,
      filePath: "assets/file.jpg"
    }),
    /SUPABASE incomplet/
  );
  assert.throws(
    () => resolveAssetFileStorage({
      storageProvider: "LOCAL",
      storageBucket: "asset-files",
      storageKey: "assets/file.jpg",
      filePath: "/uploads/assets/assets/file.jpg"
    }),
    /LOCAL incoherent/
  );
  assert.throws(
    () => resolveAssetFileStorage({
      storageProvider: "LOCAL",
      storageBucket: null,
      storageKey: "../file.jpg",
      filePath: "/uploads/assets/../file.jpg"
    }),
    /Cle de stockage/
  );
});

test("un echec Prisma declenche exactement une compensation et conserve l'erreur", async () => {
  const persistenceError = new Error("Prisma transaction failed");
  const deletedKeys = [];
  const storage = {
    async deleteObject(storageKey) {
      deletedKeys.push(storageKey);
      return true;
    }
  };
  const storedObject = {
    provider: "LOCAL",
    bucket: null,
    key: "ABC/new-file.jpg",
    filePath: "/uploads/assets/ABC/new-file.jpg"
  };

  await assert.rejects(
    persistWithStorageCompensation({
      storage,
      storedObject,
      persist: async () => {
        throw persistenceError;
      }
    }),
    (error) => error === persistenceError
  );
  assert.deepEqual(deletedKeys, ["ABC/new-file.jpg"]);
});

test("un echec de compensation est journalise sans remplacer l'erreur Prisma", async () => {
  const persistenceError = new Error("Prisma transaction failed");
  const logs = [];
  const storage = {
    async deleteObject() {
      const error = new Error("disk unavailable");
      error.name = "StorageProviderError";
      throw error;
    }
  };
  const storedObject = {
    provider: "LOCAL",
    bucket: null,
    key: "ABC/new-file.jpg",
    filePath: "/uploads/assets/ABC/new-file.jpg"
  };

  await assert.rejects(
    persistWithStorageCompensation({
      storage,
      storedObject,
      persist: async () => {
        throw persistenceError;
      },
      logCompensationFailure: (details) => logs.push(details)
    }),
    (error) => error === persistenceError
  );
  assert.deepEqual(logs, [{
    provider: "LOCAL",
    bucket: null,
    storageKey: "ABC/new-file.jpg",
    errorType: "StorageProviderError"
  }]);
});

test("les URL signees expirent par defaut apres cinq minutes", () => {
  assert.equal(DEFAULT_SIGNED_URL_EXPIRY_SECONDS, 300);
});

test("le provider Supabase reste serveur, paresseux et sans URL publique", async () => {
  const source = await readFile(new URL("../lib/storage/supabase-storage-provider.js", import.meta.url), "utf8");
  assert.match(source, /^import "server-only";/);
  assert.match(source, /createSupabaseStorageAdminClientFactory/);
  assert.match(source, /createSignedDownloadUrl\(storageKey, expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRY_SECONDS\)/);
  assert.doesNotMatch(source, /getPublicUrl/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /console\.(log|error|warn)/);
});

test("le client administrateur refuse un environnement navigateur simule", async () => {
  const { createSupabaseStorageAdminClient } = await import(
    "../lib/storage/supabase-storage-admin-client.js"
  );
  assert.throws(
    () => createSupabaseStorageAdminClient({
      env: {},
      runtime: { window: {} },
      fetchImplementation: async () => assert.fail("fetch ne doit pas etre appele")
    }),
    /reserve au serveur/
  );
});

test("la factory du client administrateur est paresseuse et reutilise son instance", async () => {
  const { createSupabaseStorageAdminClientFactory } = await import(
    "../lib/storage/supabase-storage-admin-client.js"
  );
  let fetchCalls = 0;
  const getClient = createSupabaseStorageAdminClientFactory({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid/",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
      SUPABASE_STORAGE_BUCKET: "asset-files"
    },
    runtime: {},
    fetchImplementation: async () => {
      fetchCalls += 1;
      return new Response(null, { status: 200 });
    }
  });
  const first = getClient();
  const second = getClient();
  assert.equal(first, second);
  assert.equal(first.bucketName, "asset-files");
  assert.equal(fetchCalls, 0);
});

test("le client administrateur construit des requetes privees sans session", async () => {
  const { createSupabaseStorageAdminClient } = await import(
    "../lib/storage/supabase-storage-admin-client.js"
  );
  const calls = [];
  const client = createSupabaseStorageAdminClient({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
      SUPABASE_STORAGE_BUCKET: "asset-files"
    },
    runtime: {},
    fetchImplementation: async (url, options) => {
      calls.push({ url, options });
      return new Response(null, { status: 200 });
    }
  });
  const headers = client.requestHeaders({ "content-type": "application/octet-stream" });
  assert.equal(headers.apikey, "test-service-role");
  assert.equal(headers.authorization, "Bearer test-service-role");
  assert.equal(
    client.objectUrl("assets/unit/file.jpg"),
    "https://example.invalid/storage/v1/object/asset-files/assets/unit/file.jpg"
  );
  await client.request(client.objectUrl("assets/unit/file.jpg"), { method: "HEAD", headers });
  assert.equal(calls.length, 1);
});

test("une configuration invalide ne construit ni client ni requete", async () => {
  const { createSupabaseStorageAdminClientFactory } = await import(
    "../lib/storage/supabase-storage-admin-client.js"
  );
  let fetchCalls = 0;
  const getClient = createSupabaseStorageAdminClientFactory({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_STORAGE_BUCKET: "asset-files"
    },
    runtime: {},
    fetchImplementation: async () => {
      fetchCalls += 1;
    }
  });
  assert.throws(() => getClient(), /SUPABASE_SERVICE_ROLE_KEY/);
  assert.equal(fetchCalls, 0);
});

test("le provider Supabase accepte un client injecte sans acces reseau", async () => {
  const { SupabaseStorageProvider } = await import("../lib/storage/supabase-storage-provider.js");
  const calls = [];
  const provider = new SupabaseStorageProvider({
    adminClient: {
      bucketName: "asset-files",
      projectUrl: "https://example.invalid",
      requestHeaders: (extra = {}) => ({ authorization: "Bearer fake", ...extra }),
      objectUrl: (key) => `mock://asset-files/${key}`,
      objectListUrl: () => "mock://asset-files",
      async request(url, options) {
        calls.push({ url, options });
        return new Response(null, { status: 200 });
      }
    }
  });
  const bytes = Buffer.from("mock-only");
  const result = await provider.putObject({
    storageKey: "assets/unit/file.txt",
    bytes,
    contentType: "text/plain",
    size: bytes.length
  });
  assert.equal(result.provider, "SUPABASE");
  assert.equal(result.bucket, "asset-files");
  assert.equal(result.key, "assets/unit/file.txt");
  assert.equal(result.filePath, "assets/unit/file.txt");
  assert.equal(calls.length, 1);
});

test("l'upload Supabase transmet le type et interdit l'ecrasement", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([
    new Response(null, { status: 200 })
  ]);
  const bytes = Buffer.from("phase10d-d", "utf8");
  const result = await provider.putObject({
    storageKey: "assets/units/unit-test/file-test/file-test.txt",
    bytes,
    contentType: "text/plain",
    originalFilename: "phase10d-d-storage-test.txt",
    size: bytes.length
  });
  assert.equal(result.provider, "SUPABASE");
  assert.equal(result.bucket, "asset-files");
  assert.equal(result.key, "assets/units/unit-test/file-test/file-test.txt");
  assert.equal(result.filePath, result.key);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers["content-type"], "text/plain");
  assert.equal(calls[0].headers["x-upsert"], "false");
  assert.equal(calls[0].body.equals(bytes), true);
});

test("les erreurs d'upload Supabase sont converties sans secret", async () => {
  for (const [response, pattern] of [
    [new Response(null, { status: 409 }), /existe deja/],
    [new Response(null, { status: 404 }), /Bucket Storage inaccessible/],
    [new Response(null, { status: 403 }), /Acces Storage refuse/],
    [new Response(null, { status: 500 }), /Upload Storage refuse/],
    [new TypeError("network includes test-only-secret"), /erreur reseau/]
  ]) {
    const { provider } = await createMockedSupabaseProvider([response]);
    const bytes = Buffer.from("x");
    await assert.rejects(
      provider.putObject({
        storageKey: "assets/units/unit-test/file-test/file-test.txt",
        bytes,
        contentType: "text/plain",
        originalFilename: "test.txt",
        size: bytes.length
      }),
      (error) => {
        assert.match(error.message, pattern);
        assert.doesNotMatch(error.message, /test-only-secret/);
        return true;
      }
    );
  }
});

test("un contenu Supabase incoherent est rejete avant tout appel", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([]);
  await assert.rejects(
    provider.putObject({
      storageKey: "assets/units/unit-test/file-test/file-test.txt",
      bytes: Buffer.from("x"),
      contentType: "text/plain",
      originalFilename: "test.txt",
      size: 2
    }),
    /Metadonnees du contenu Storage invalides/
  );
  assert.equal(calls.length, 0);
});

test("la compensation Supabase supprime exactement la cle creee", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([
    new Response(null, { status: 200 }),
    new Response(null, { status: 200 })
  ]);
  const bytes = Buffer.from("phase10d-d");
  const storedObject = await provider.putObject({
    storageKey: "assets/units/unit-test/file-test/file-test.txt",
    bytes,
    contentType: "text/plain",
    originalFilename: "test.txt",
    size: bytes.length
  });
  const persistenceError = new Error("Prisma test failure");
  await assert.rejects(
    persistWithStorageCompensation({
      storage: provider,
      storedObject,
      persist: async () => {
        throw persistenceError;
      }
    }),
    (error) => error === persistenceError
  );
  assert.deepEqual(calls.map(({ method }) => method), ["POST", "DELETE"]);
  assert.equal(calls[0].url, calls[1].url);
});

test("une erreur de suppression Supabase ne remplace pas l'erreur Prisma", async () => {
  const { provider } = await createMockedSupabaseProvider([
    new Response(null, { status: 200 }),
    new Response(null, { status: 500 })
  ]);
  const bytes = Buffer.from("phase10d-d");
  const storedObject = await provider.putObject({
    storageKey: "assets/units/unit-test/file-test/file-test.txt",
    bytes,
    contentType: "text/plain",
    originalFilename: "test.txt",
    size: bytes.length
  });
  const persistenceError = new Error("Prisma test failure");
  const logs = [];
  await assert.rejects(
    persistWithStorageCompensation({
      storage: provider,
      storedObject,
      persist: async () => {
        throw persistenceError;
      },
      logCompensationFailure: (details) => logs.push(details)
    }),
    (error) => error === persistenceError
  );
  assert.deepEqual(logs, [{
    provider: "SUPABASE",
    bucket: "asset-files",
    storageKey: "assets/units/unit-test/file-test/file-test.txt",
    errorType: "StorageProviderError"
  }]);
});

test("la configuration privilegiee reste hors des modules client et barrels partages", async () => {
  const [configurationSource, clientSource, barrelSource] = await Promise.all([
    readFile(new URL("../lib/storage/supabase-storage-server-config.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/storage/supabase-storage-admin-client.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/storage/index.js", import.meta.url), "utf8")
  ]);
  assert.match(configurationSource, /^import "server-only";/);
  assert.match(clientSource, /^import "server-only";/);
  assert.doesNotMatch(configurationSource, /["']use client["']/);
  assert.doesNotMatch(clientSource, /["']use client["']/);
  assert.doesNotMatch(barrelSource, /supabase-storage-(?:server-config|admin-client)/);
  assert.doesNotMatch(configurationSource, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
});

test("la factory concrete n'effectue aucune operation Storage au chargement", async () => {
  const source = await readFile(new URL("../lib/storage/get-file-storage-provider.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.(putObject|deleteObject|createSignedDownloadUrl)\(/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("objectExists retourne true pour un objet present", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([
    new Response(null, { status: 200 })
  ]);
  assert.equal(await provider.objectExists("diagnostics/present.png"), true);
  assert.deepEqual(calls.map(({ method }) => method), ["HEAD"]);
});

test("objectExists retourne false pour HTTP 404", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([
    new Response(null, { status: 404 })
  ]);
  assert.equal(await provider.objectExists("diagnostics/missing.png"), false);
  assert.equal(calls.length, 1);
});

test("objectExists confirme la signature Supabase HTTP 400 d'un objet absent", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([
    new Response(null, { status: 400 }),
    Response.json(
      { statusCode: "404", error: "not_found", message: "Object not found" },
      { status: 400 }
    )
  ]);
  assert.equal(await provider.objectExists("diagnostics/missing.png"), false);
  assert.deepEqual(calls.map(({ method }) => method), ["HEAD", "GET"]);
});

test("objectExists ne masque pas un HTTP 400 generique", async () => {
  const { provider } = await createMockedSupabaseProvider([
    new Response(null, { status: 400 }),
    Response.json(
      { statusCode: "400", error: "bad_request", message: "Invalid request" },
      { status: 400 }
    )
  ]);
  await assert.rejects(
    provider.objectExists("diagnostics/invalid.png"),
    /Verification Storage refusee \(HTTP 400\)/
  );
});

test("objectExists ne masque pas les erreurs d'autorisation", async () => {
  for (const status of [401, 403]) {
    const { provider } = await createMockedSupabaseProvider([
      new Response(null, { status })
    ]);
    await assert.rejects(
      provider.objectExists("diagnostics/private.png"),
      new RegExp(`Verification Storage refusee \\(HTTP ${status}\\)`)
    );
  }
});

test("objectExists ne masque pas une erreur serveur", async () => {
  const { provider } = await createMockedSupabaseProvider([
    new Response(null, { status: 500 })
  ]);
  await assert.rejects(
    provider.objectExists("diagnostics/server-error.png"),
    /Verification Storage refusee \(HTTP 500\)/
  );
});

test("objectExists propage une erreur reseau", async () => {
  const { provider } = await createMockedSupabaseProvider([
    new TypeError("network unavailable")
  ]);
  await assert.rejects(
    provider.objectExists("diagnostics/network.png"),
    /network unavailable/
  );
});

test("objectExists rejette une cle invalide avant tout appel reseau", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([]);
  await assert.rejects(
    provider.objectExists("../secret.png"),
    /Cle de stockage/
  );
  assert.equal(calls.length, 0);
});

async function loadAbsenceWaiter() {
  const module = await import("../lib/storage/supabase-storage-provider.js");
  return module.waitForObjectAbsence;
}

function createSequenceProvider(sequence) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async isObjectListed() {
      const value = sequence[calls++];
      if (value instanceof Error) throw value;
      return value;
    },
    objectExists: () => assert.fail("L'attente ne doit pas appeler objectExists().")
  };
}

test("isObjectListed retourne true pour le nom exact", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([
    Response.json([{ name: "file.png", id: "object-id" }])
  ]);
  assert.equal(await provider.isObjectListed("diagnostics/folder/file.png"), true);
  const request = JSON.parse(calls[0].body);
  assert.equal(request.prefix, "diagnostics/folder");
});

test("isObjectListed retourne false pour un dossier vide", async () => {
  const { provider } = await createMockedSupabaseProvider([Response.json([])]);
  assert.equal(await provider.isObjectListed("diagnostics/folder/file.png"), false);
});

test("isObjectListed refuse un nom voisin comme correspondance", async () => {
  const { provider } = await createMockedSupabaseProvider([
    Response.json([{ name: "other-file.png" }, { name: "file.png.backup" }])
  ]);
  assert.equal(
    await provider.isObjectListed("diagnostics/folder/file.png", { pageSize: 10 }),
    false
  );
});

test("isObjectListed refuse une extension voisine", async () => {
  const { provider } = await createMockedSupabaseProvider([
    Response.json([{ name: "file.jpg" }])
  ]);
  assert.equal(await provider.isObjectListed("diagnostics/folder/file.png"), false);
});

test("isObjectListed ne confond pas un dossier homonyme avec un fichier", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([
    Response.json([{ name: "file.png", id: null }])
  ]);
  assert.equal(
    await provider.isObjectListed("diagnostics/expected/file.png"),
    false
  );
  assert.equal(JSON.parse(calls[0].body).prefix, "diagnostics/expected");
});

test("isObjectListed separe correctement une cle racine", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([
    Response.json([{ name: "file.png", id: "root-object-id" }])
  ]);
  assert.equal(await provider.isObjectListed("file.png"), true);
  const request = JSON.parse(calls[0].body);
  assert.equal(request.prefix, "");
});

test("isObjectListed separe correctement une cle multiniveau", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([
    Response.json([])
  ]);
  assert.equal(await provider.isObjectListed("a/b/c/file.png"), false);
  assert.equal(JSON.parse(calls[0].body).prefix, "a/b/c");
});

test("isObjectListed propage une erreur d'inventaire", async () => {
  const { provider } = await createMockedSupabaseProvider([
    new Response(null, { status: 400 })
  ]);
  await assert.rejects(
    provider.isObjectListed("diagnostics/folder/file.png"),
    /Inventaire Storage refuse \(HTTP 400\)/
  );
});

test("isObjectListed propage les erreurs 401 et 403", async () => {
  for (const status of [401, 403]) {
    const { provider } = await createMockedSupabaseProvider([
      new Response(null, { status })
    ]);
    await assert.rejects(
      provider.isObjectListed("diagnostics/folder/file.png"),
      new RegExp(`Inventaire Storage refuse \\(HTTP ${status}\\)`)
    );
  }
});

test("isObjectListed propage une reponse invalide", async () => {
  const { provider } = await createMockedSupabaseProvider([
    Response.json({ objects: [] })
  ]);
  await assert.rejects(
    provider.isObjectListed("diagnostics/folder/file.png"),
    /Reponse d'inventaire Storage invalide/
  );
});

test("isObjectListed trouve l'objet sur une page suivante", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([
    Response.json([{ name: "a.png", id: "a" }, { name: "b.png", id: "b" }]),
    Response.json([{ name: "file.png", id: "object-id" }])
  ]);
  assert.equal(
    await provider.isObjectListed("diagnostics/folder/file.png", { pageSize: 2 }),
    true
  );
  assert.deepEqual(calls.map(({ body }) => JSON.parse(body).offset), [0, 2]);
});

test("isObjectListed termine la pagination sans faux positif", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([
    Response.json([{ name: "a.png" }, { name: "b.png" }]),
    Response.json([{ name: "c.png" }])
  ]);
  assert.equal(
    await provider.isObjectListed("diagnostics/folder/file.png", { pageSize: 2 }),
    false
  );
  assert.equal(calls.length, 2);
});

test("waitForObjectAbsence confirme une absence des la premiere verification", async () => {
  const waitForObjectAbsence = await loadAbsenceWaiter();
  const provider = createSequenceProvider([false]);
  const result = await waitForObjectAbsence(provider, "diagnostics/deleted.png", {
    delaysMs: [250],
    sleep: () => assert.fail("Aucune attente ne doit etre executee.")
  });
  assert.deepEqual(result.observations, [false]);
  assert.equal(result.attempts, 1);
  assert.equal(provider.calls, 1);
});

test("waitForObjectAbsence gere une presence puis une absence", async () => {
  const waitForObjectAbsence = await loadAbsenceWaiter();
  const provider = createSequenceProvider([true, false]);
  const delays = [];
  const result = await waitForObjectAbsence(provider, "diagnostics/deleted.png", {
    delaysMs: [250],
    sleep: async (delay) => delays.push(delay)
  });
  assert.deepEqual(result.observations, [true, false]);
  assert.deepEqual(delays, [250]);
  assert.equal(result.attempts, 2);
});

test("waitForObjectAbsence gere plusieurs presences avant disparition", async () => {
  const waitForObjectAbsence = await loadAbsenceWaiter();
  const provider = createSequenceProvider([true, true, true, false]);
  const result = await waitForObjectAbsence(provider, "diagnostics/deleted.png", {
    delaysMs: [250, 500, 750],
    sleep: async () => {}
  });
  assert.deepEqual(result.observations, [true, true, true, false]);
  assert.equal(result.attempts, 4);
});

test("waitForObjectAbsence echoue explicitement si l'objet reste visible", async () => {
  const waitForObjectAbsence = await loadAbsenceWaiter();
  const provider = createSequenceProvider([true, true, true]);
  await assert.rejects(
    waitForObjectAbsence(provider, "diagnostics/visible.png", {
      delaysMs: [250, 500],
      sleep: async () => {}
    }),
    /Object still visible after deletion verification timeout/
  );
  assert.equal(provider.calls, 3);
});

test("waitForObjectAbsence propage immediatement une erreur d'autorisation", async () => {
  const waitForObjectAbsence = await loadAbsenceWaiter();
  const provider = createSequenceProvider([new Error("HTTP 403")]);
  await assert.rejects(
    waitForObjectAbsence(provider, "diagnostics/private.png"),
    /HTTP 403/
  );
  assert.equal(provider.calls, 1);
});

test("waitForObjectAbsence propage une erreur reseau apres une presence", async () => {
  const waitForObjectAbsence = await loadAbsenceWaiter();
  const provider = createSequenceProvider([true, new TypeError("network unavailable")]);
  await assert.rejects(
    waitForObjectAbsence(provider, "diagnostics/network.png", {
      delaysMs: [250],
      sleep: async () => {}
    }),
    /network unavailable/
  );
  assert.equal(provider.calls, 2);
});

test("waitForObjectAbsence respecte strictement le maximum de tentatives", async () => {
  const waitForObjectAbsence = await loadAbsenceWaiter();
  const provider = createSequenceProvider([true, true, true, true, true, false]);
  await assert.rejects(
    waitForObjectAbsence(provider, "diagnostics/visible.png", {
      delaysMs: [250, 500, 750, 1000],
      sleep: async () => {}
    }),
    /Object still visible/
  );
  assert.equal(provider.calls, 5);
});

test("waitForObjectAbsence utilise uniquement les delais injectes", async () => {
  const waitForObjectAbsence = await loadAbsenceWaiter();
  const provider = createSequenceProvider([true, true, false]);
  const delays = [];
  let clock = 1000;
  const result = await waitForObjectAbsence(provider, "diagnostics/deleted.png", {
    delaysMs: [250, 500, 750],
    sleep: async (delay) => {
      delays.push(delay);
      clock += delay;
    },
    now: () => clock
  });
  assert.deepEqual(delays, [250, 500]);
  assert.equal(result.elapsedMs, 750);
  assert.equal(result.totalDelayMs, 750);
  assert.equal(result.verificationMethod, "list");
  assert.equal(provider.calls, 3);
});

test("waitForObjectAbsence inclut la latence simulee dans elapsedMs", async () => {
  const waitForObjectAbsence = await loadAbsenceWaiter();
  let clock = 0;
  let calls = 0;
  const provider = {
    objectExists: () => assert.fail("objectExists ne doit pas etre appele."),
    async isObjectListed() {
      calls += 1;
      clock += 100;
      return calls < 2;
    }
  };
  const result = await waitForObjectAbsence(provider, "diagnostics/deleted.png", {
    delaysMs: [250],
    sleep: async (delay) => {
      clock += delay;
    },
    now: () => clock
  });
  assert.equal(result.totalDelayMs, 250);
  assert.equal(result.elapsedMs, 450);
  assert.deepEqual(result.observations, [true, false]);
});

test("l'attente bornee ne modifie pas l'interpretation restrictive de objectExists", async () => {
  const source = await readFile(
    new URL("../lib/storage/supabase-storage-provider.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /body\?\.error === "not_found"/);
  assert.match(source, /body\?\.message === "Object not found"/);
  assert.doesNotMatch(source, /response\.status === 400\) return false/);
});

test("deleteObject n'effectue aucune seconde suppression automatique", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([
    new Response(null, { status: 200 })
  ]);
  assert.equal(await provider.deleteObject("diagnostics/deleted.png"), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "DELETE");
});

async function loadAssetFileAccessResolver() {
  return import("../lib/storage/asset-file-access.js");
}

test("le TTL des URL signees est centralise et strictement borne", async () => {
  const {
    DEFAULT_SIGNED_URL_EXPIRY_SECONDS,
    resolveSignedUrlExpirySeconds
  } = await import("../lib/storage/config.js");
  assert.equal(DEFAULT_SIGNED_URL_EXPIRY_SECONDS, 300);
  assert.equal(resolveSignedUrlExpirySeconds(undefined), 300);
  assert.equal(resolveSignedUrlExpirySeconds(" 300 "), 300);
  for (const value of ["abc", "-1", "59", "3601", "1.5"]) {
    assert.throws(() => resolveSignedUrlExpirySeconds(value), /TTL_SECONDS/);
  }
});

test("le resolveur conserve une ancienne ligne LOCAL sans initialiser Supabase", async () => {
  const { resolveAssetFileAccess } = await loadAssetFileAccessResolver();
  let providerCalls = 0;
  const assetFile = {
    id: "legacy-local",
    storageProvider: null,
    storageBucket: null,
    storageKey: null,
    filePath: "/uploads/assets/ABC/legacy.jpg"
  };
  const result = await resolveAssetFileAccess(assetFile, {
    getStorageProvider: () => {
      providerCalls += 1;
      throw new Error("Supabase ne doit pas etre initialise.");
    }
  });
  assert.deepEqual(result, {
    provider: "LOCAL",
    url: "/uploads/assets/ABC/legacy.jpg",
    expiresAt: null
  });
  assert.equal(providerCalls, 0);
  assert.equal(assetFile.filePath, "/uploads/assets/ABC/legacy.jpg");
});

test("le resolveur conserve une nouvelle ligne LOCAL sans appel Storage", async () => {
  const { resolveAssetFileAccess } = await loadAssetFileAccessResolver();
  let providerCalls = 0;
  const result = await resolveAssetFileAccess({
    id: "new-local",
    storageProvider: "LOCAL",
    storageBucket: null,
    storageKey: "ABC/new.jpg",
    filePath: "/uploads/assets/ABC/new.jpg"
  }, {
    getStorageProvider: () => {
      providerCalls += 1;
      throw new Error("Storage ne doit pas etre appele.");
    }
  });
  assert.equal(result.provider, "LOCAL");
  assert.equal(result.url, "/uploads/assets/ABC/new.jpg");
  assert.equal(result.expiresAt, null);
  assert.equal(providerCalls, 0);
});

test("le resolveur refuse les chemins LOCAL dangereux", async () => {
  const { resolveAssetFileAccess } = await loadAssetFileAccessResolver();
  for (const filePath of [
    "",
    "../secret.jpg",
    "C:\\secret.jpg",
    "https://example.invalid/file.jpg",
    "javascript:alert(1)",
    "data:text/plain,test",
    "/uploads/assets/../secret.jpg"
  ]) {
    await assert.rejects(resolveAssetFileAccess({
      id: "unsafe-local",
      storageProvider: null,
      storageBucket: null,
      storageKey: null,
      filePath
    }));
  }
});

test("le resolveur SUPABASE signe une fois avec bucket, cle et TTL controles", async () => {
  const { resolveAssetFileAccess } = await loadAssetFileAccessResolver();
  const calls = [];
  const fixedNow = Date.parse("2026-07-30T12:00:00.000Z");
  const storage = {
    getBucketName: () => "asset-files",
    async createSignedDownloadUrl(key, ttl) {
      calls.push({ key, ttl });
      return {
        url: "https://example.invalid/storage/signed/fake",
        expiresAt: new Date(fixedNow + ttl * 1000)
      };
    }
  };
  const assetFile = {
    id: "supabase-file",
    storageProvider: "SUPABASE",
    storageBucket: "asset-files",
    storageKey: "assets/units/unit/file/file.txt",
    filePath: "assets/units/unit/file/file.txt"
  };
  const result = await resolveAssetFileAccess(assetFile, {
    getStorageProvider: (name) => {
      assert.equal(name, "supabase");
      return storage;
    },
    signedUrlTtlSeconds: 300,
    now: () => fixedNow
  });
  assert.equal(result.provider, "SUPABASE");
  assert.equal(result.url, "https://example.invalid/storage/signed/fake");
  assert.equal(result.expiresAt.toISOString(), "2026-07-30T12:05:00.000Z");
  assert.deepEqual(calls, [{
    key: "assets/units/unit/file/file.txt",
    ttl: 300
  }]);
  assert.equal(assetFile.filePath, assetFile.storageKey);
});

test("les metadonnees SUPABASE incoherentes sont refusees avant le SDK", async () => {
  const { resolveAssetFileAccess } = await loadAssetFileAccessResolver();
  let providerCalls = 0;
  const invalidFiles = [
    { storageBucket: null, storageKey: "assets/file.txt", filePath: "assets/file.txt" },
    { storageBucket: "asset-files", storageKey: null, filePath: "assets/file.txt" },
    { storageBucket: "asset-files", storageKey: "/assets/file.txt", filePath: "/assets/file.txt" },
    { storageBucket: "asset-files", storageKey: "../file.txt", filePath: "../file.txt" },
    { storageBucket: "asset-files", storageKey: "https://example.invalid/file", filePath: "https://example.invalid/file" },
    { storageBucket: "asset-files", storageKey: "assets/file.txt?token=fake", filePath: "assets/file.txt?token=fake" },
    { storageBucket: "asset-files", storageKey: "assets/file.txt#fragment", filePath: "assets/file.txt#fragment" },
    { storageBucket: "asset-files", storageKey: "assets\\file.txt", filePath: "assets\\file.txt" },
    { storageBucket: "asset-files", storageKey: "assets/file.txt", filePath: "different/file.txt" }
  ];
  for (const invalid of invalidFiles) {
    await assert.rejects(resolveAssetFileAccess({
      id: "invalid-supabase",
      storageProvider: "SUPABASE",
      ...invalid
    }, {
      getStorageProvider: () => {
        providerCalls += 1;
        return {};
      }
    }));
  }
  assert.equal(providerCalls, 0);
});

test("un bucket SUPABASE different de la configuration est refuse sans signature", async () => {
  const { resolveAssetFileAccess } = await loadAssetFileAccessResolver();
  let signed = 0;
  await assert.rejects(resolveAssetFileAccess({
    id: "wrong-bucket",
    storageProvider: "SUPABASE",
    storageBucket: "other-bucket",
    storageKey: "assets/file.txt",
    filePath: "assets/file.txt"
  }, {
    getStorageProvider: () => ({
      getBucketName: () => "asset-files",
      createSignedDownloadUrl: async () => {
        signed += 1;
      }
    })
  }), /Bucket AssetFile incoherent/);
  assert.equal(signed, 0);
});

test("une erreur de signature SUPABASE reste controlee et sans secret", async () => {
  const { resolveAssetFileAccess } = await loadAssetFileAccessResolver();
  const secret = "test-only-secret";
  await assert.rejects(resolveAssetFileAccess({
    id: "signature-error",
    storageProvider: "SUPABASE",
    storageBucket: "asset-files",
    storageKey: "assets/file.txt",
    filePath: "assets/file.txt"
  }, {
    getStorageProvider: () => ({
      getBucketName: () => "asset-files",
      createSignedDownloadUrl: async () => {
        throw new Error("Signature Storage impossible (erreur reseau).");
      }
    })
  }), (error) => {
    assert.doesNotMatch(error.message, new RegExp(secret));
    assert.match(error.message, /Signature Storage impossible/);
    return true;
  });
});

test("le resolveur serveur rejette un environnement navigateur avant le client", async () => {
  const { resolveAssetFileAccess } = await loadAssetFileAccessResolver();
  let providerCalls = 0;
  await assert.rejects(resolveAssetFileAccess({
    id: "browser-file",
    storageProvider: "SUPABASE",
    storageBucket: "asset-files",
    storageKey: "assets/file.txt",
    filePath: "assets/file.txt"
  }, {
    runtime: { window: {} },
    getStorageProvider: () => {
      providerCalls += 1;
    }
  }), /reservee au serveur/);
  assert.equal(providerCalls, 0);
});

test("la resolution signee reste en memoire et ne persiste aucune valeur", async () => {
  const { resolveAssetFileAccess } = await loadAssetFileAccessResolver();
  const assetFile = Object.freeze({
    id: "immutable-file",
    storageProvider: "SUPABASE",
    storageBucket: "asset-files",
    storageKey: "assets/file.txt",
    filePath: "assets/file.txt"
  });
  let prismaWrites = 0;
  const result = await resolveAssetFileAccess(assetFile, {
    getStorageProvider: () => ({
      getBucketName: () => "asset-files",
      createSignedDownloadUrl: async () => ({
        url: "https://example.invalid/storage/signed/fake",
        expiresAt: new Date()
      })
    })
  });
  assert.equal(result.url.includes("signed"), true);
  assert.equal(assetFile.filePath, "assets/file.txt");
  assert.equal(assetFile.storageKey, "assets/file.txt");
  assert.equal(prismaWrites, 0);
  assert.equal("expiresAt" in assetFile, false);
});

test("le DTO UI conserve l'acces LOCAL sans exposer les metadonnees internes", async () => {
  const { toAssetFileAccessDto } = await import(
    "../lib/storage/asset-file-access-dto.js"
  );
  const dto = await toAssetFileAccessDto({
    id: "legacy-local",
    fileName: "photo.jpg",
    storageProvider: null,
    storageBucket: null,
    storageKey: null,
    filePath: "/uploads/assets/photo.jpg"
  });

  assert.equal(dto.provider, "LOCAL");
  assert.equal(dto.accessUrl, "/uploads/assets/photo.jpg");
  assert.equal(dto.accessExpiresAt, null);
  assert.equal(dto.accessStatus, "available");
  for (const internal of ["filePath", "storageProvider", "storageBucket", "storageKey"]) {
    assert.equal(internal in dto, false);
  }
});

test("le DTO UI utilise uniquement l'URL signee memoire pour SUPABASE", async () => {
  const { toAssetFileAccessDto } = await import(
    "../lib/storage/asset-file-access-dto.js"
  );
  const expiresAt = new Date("2026-07-30T12:05:00.000Z");
  const dto = await toAssetFileAccessDto({
    id: "supabase-file",
    fileName: "private.png",
    storageProvider: "SUPABASE",
    storageBucket: "asset-files",
    storageKey: "assets/unit/private.png",
    filePath: "assets/unit/private.png"
  }, {
    resolveAccess: async () => ({
      provider: "SUPABASE",
      url: "https://example.invalid/signed/test-only",
      expiresAt
    })
  });

  assert.equal(dto.provider, "SUPABASE");
  assert.equal(dto.accessUrl, "https://example.invalid/signed/test-only");
  assert.equal(dto.accessExpiresAt, expiresAt.toISOString());
  assert.equal(dto.filePath, undefined);
  assert.equal(dto.storageKey, undefined);
  assert.equal(dto.storageBucket, undefined);
});

test("une erreur de fichier reste partielle dans une liste de DTO", async () => {
  const { StorageValidationError } = await import("../lib/storage/errors.js");
  const { toAssetFileAccessDtos } = await import(
    "../lib/storage/asset-file-access-dto.js"
  );
  const files = [{ id: "ok" }, { id: "invalid", storageProvider: "UNKNOWN" }];
  const dtos = await toAssetFileAccessDtos(files, {
    resolveAccess: async (file) => {
      if (file.id === "invalid") {
        throw new StorageValidationError("detail technique masque");
      }
      return { provider: "LOCAL", url: "/uploads/assets/ok.jpg", expiresAt: null };
    }
  });

  assert.equal(dtos[0].accessStatus, "available");
  assert.equal(dtos[1].accessStatus, "invalid");
  assert.equal(dtos[1].accessUrl, null);
  assert.doesNotMatch(dtos[1].accessMessage, /detail technique/);
});

test("les frontieres serveur projettent les fichiers avant serialisation", async () => {
  const sources = await Promise.all([
    "../app/parc/page.js",
    "../app/api/asset-units/route.js",
    "../app/api/asset-units/[id]/route.js",
    "../app/api/asset-units/[id]/files/route.js",
    "../app/api/asset-files/route.js",
    "../app/api/asset-files/[id]/route.js"
  ].map((relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8")));

  for (const source of sources) {
    assert.match(source, /toAsset(File|Units)AccessDto/);
  }
});

test("les composants clients rendent accessUrl sans importer le client privilegie", async () => {
  const sources = await Promise.all([
    "../app/parc/asset-file-access-view.js",
    "../app/parc/asset-park.js",
    "../app/parc/[id]/asset-unit-detail.js"
  ].map((relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8")));
  const combined = sources.join("\n");

  assert.match(combined, /accessUrl/);
  assert.match(combined, /noopener noreferrer/);
  assert.doesNotMatch(combined, /\.filePath/);
  assert.doesNotMatch(combined, /storageKey|storageBucket|createSignedUrl|SERVICE_ROLE/);
});
