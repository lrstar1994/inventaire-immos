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

test("isObjectListed ne confond pas un sous-dossier voisin", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([
    Response.json([{ name: "file.png", id: null }])
  ]);
  assert.equal(
    await provider.isObjectListed("diagnostics/expected/file.png"),
    true
  );
  assert.equal(JSON.parse(calls[0].body).prefix, "diagnostics/expected");
});

test("isObjectListed separe correctement une cle racine", async () => {
  const { provider, calls } = await createMockedSupabaseProvider([
    Response.json([{ name: "file.png" }])
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
    Response.json([{ name: "a.png" }, { name: "b.png" }]),
    Response.json([{ name: "file.png" }])
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
