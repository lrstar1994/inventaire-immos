import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const SERVER_ONLY_LOADER = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export%20default%20undefined", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(SERVER_ONLY_LOADER)}`);

const {
  ASSET_FILE_PURGE_MODES,
  ASSET_FILE_RETENTION_DAYS,
  AssetFilePurgeError,
  PROTECTED_HISTORICAL_LOCAL_FILES,
  createSafeLocalBinaryOperations,
  processDeferredAssetFilePurge
} = await import("../lib/storage/asset-file-deletion-plan.js");

const NOW = new Date("2026-07-30T12:00:00.000Z");
const OLD = new Date("2026-06-29T12:00:00.000Z");
const EXACT = new Date("2026-06-30T12:00:00.000Z");
const RECENT = new Date("2026-07-01T12:00:00.001Z");

function localRow(overrides = {}) {
  return {
    id: "file-1",
    deletedAt: OLD,
    updatedAt: new Date("2026-06-29T12:00:01.000Z"),
    storageProvider: "LOCAL",
    storageBucket: null,
    storageKey: "UNIT/file.txt",
    filePath: "/uploads/assets/UNIT/file.txt",
    ...overrides
  };
}

function supabaseRow(overrides = {}) {
  return {
    id: "file-1",
    deletedAt: OLD,
    updatedAt: new Date("2026-06-29T12:00:01.000Z"),
    storageProvider: "SUPABASE",
    storageBucket: "asset-files",
    storageKey: "assets/units/unit-1/file.txt",
    filePath: "assets/units/unit-1/file.txt",
    ...overrides
  };
}

function mockPrisma({ rows = [localRow()], otherRows = [], deleteError, deleteCount = 1 } = {}) {
  let loadIndex = 0;
  const calls = { findUnique: 0, findMany: 0, deleteMany: 0 };
  const prismaClient = {
    assetFile: {
      async findUnique() {
        calls.findUnique += 1;
        const row = rows[Math.min(loadIndex, rows.length - 1)] ?? null;
        loadIndex += 1;
        return row;
      },
      async findMany() {
        calls.findMany += 1;
        return otherRows;
      },
      async deleteMany() {
        calls.deleteMany += 1;
        if (deleteError) throw deleteError;
        return { count: deleteCount };
      }
    }
  };
  return { prismaClient, calls };
}

function safeLocalBinary({ exists = true, deleteError } = {}) {
  const calls = { inspect: 0, delete: 0, keys: [] };
  return {
    calls,
    value: {
      async inspect(key) {
        calls.inspect += 1;
        calls.keys.push(key);
        return { exists, normalizedKey: key };
      },
      async delete(key) {
        calls.delete += 1;
        calls.keys.push(key);
        if (deleteError) throw deleteError;
        return exists;
      }
    }
  };
}

function supabaseMock({ deleted = true, error, bucket = "asset-files" } = {}) {
  const calls = { delete: 0, keys: [] };
  return {
    calls,
    value: {
      getBucketName: () => bucket,
      async deleteObject(key) {
        calls.delete += 1;
        calls.keys.push(key);
        if (error) throw error;
        return deleted;
      }
    }
  };
}

function supabaseLifecycleMock({
  existence = [],
  deleted = true,
  deleteError,
  bucket = "asset-files"
} = {}) {
  const calls = { list: 0, delete: 0, listedKeys: [], deletedKeys: [] };
  return {
    calls,
    value: {
      getBucketName: () => bucket,
      async isObjectListed(key) {
        calls.list += 1;
        calls.listedKeys.push(key);
        const next = existence.shift();
        if (next instanceof Error) throw next;
        return next;
      },
      async deleteObject(key) {
        calls.delete += 1;
        calls.deletedKeys.push(key);
        if (deleteError) throw deleteError;
        return deleted;
      }
    }
  };
}

async function run(row, options = {}) {
  const mocked = mockPrisma({ rows: [row], ...options });
  const local = safeLocalBinary(options.localOptions);
  const result = await processDeferredAssetFilePurge(
    { assetFileId: row?.id || "missing", mode: options.mode },
    {
      prismaClient: mocked.prismaClient,
      now: () => NOW,
      expectedSupabaseBucket: "asset-files",
      localBinary: local.value,
      supabaseProvider: options.supabaseProvider
    }
  );
  return { result, calls: mocked.calls, localCalls: local.calls };
}

test("la retention est centralisee a 30 jours", () => {
  assert.equal(ASSET_FILE_RETENTION_DAYS, 30);
});

test("DRY_RUN est le mode par defaut et n'effectue aucune suppression", async () => {
  const { result, calls, localCalls } = await run(localRow());
  assert.equal(result.mode, "DRY_RUN");
  assert.equal(result.status, "dry_run_complete");
  assert.equal(result.eligible, true);
  assert.equal(result.actionTaken, "none");
  assert.equal(calls.deleteMany, 0);
  assert.equal(localCalls.delete, 0);
});

test("l'entree refuse tout champ Storage fourni par l'appelant", async () => {
  const { prismaClient } = mockPrisma();
  await assert.rejects(
    processDeferredAssetFilePurge(
      { assetFileId: "file-1", storageKey: "other" },
      { prismaClient, now: () => NOW }
    ),
    /uniquement assetFileId et mode/
  );
});

test("un mode inconnu est refuse", async () => {
  await assert.rejects(
    processDeferredAssetFilePurge(
      { assetFileId: "file-1", mode: "FORCE" },
      { prismaClient: mockPrisma().prismaClient, now: () => NOW }
    ),
    /Mode de purge invalide/
  );
});

test("une ligne introuvable est idempotente et sans effet", async () => {
  const { prismaClient, calls } = mockPrisma({ rows: [null] });
  const result = await processDeferredAssetFilePurge(
    { assetFileId: "missing" },
    { prismaClient, now: () => NOW }
  );
  assert.equal(result.status, "asset_file_not_found");
  assert.equal(calls.findMany, 0);
  assert.equal(calls.deleteMany, 0);
});

test("une ligne active n'est pas eligible", async () => {
  assert.equal((await run(localRow({ deletedAt: null }))).result.status, "not_deleted");
});

test("une date de suppression invalide est rejetee", async () => {
  assert.equal(
    (await run(localRow({ deletedAt: "not-a-date" }))).result.status,
    "invalid_metadata"
  );
});

test("la retention non ecoulee bloque la purge", async () => {
  assert.equal(
    (await run(localRow({ deletedAt: RECENT }))).result.status,
    "retention_not_elapsed"
  );
});

test("exactement 30 jours et plus de 30 jours sont eligibles", async () => {
  assert.equal((await run(localRow({ deletedAt: EXACT }))).result.status, "dry_run_complete");
  assert.equal((await run(localRow({ deletedAt: OLD }))).result.status, "dry_run_complete");
});

test("une ancienne ligne LOCAL est reconnue et normalisee", async () => {
  const row = localRow({
    storageProvider: null,
    storageKey: null,
    filePath: "/uploads/assets/UNIT/legacy.txt"
  });
  const { result, localCalls } = await run(row);
  assert.equal(result.provider, "LOCAL");
  assert.equal(localCalls.keys[0], "UNIT/legacy.txt");
});

test("les metadonnees LOCAL dangereuses ou incoherentes sont refusees", async (t) => {
  for (const filePath of [
    "",
    "C:\\temp\\file.txt",
    "/uploads/assets/../secret.txt",
    "https://example.invalid/file.txt",
    "javascript:alert(1)"
  ]) {
    await t.test(filePath || "empty", async () => {
      const result = (await run(localRow({ filePath }))).result;
      assert.equal(result.status, "invalid_metadata");
    });
  }
});

test("les trois JPEG historiques sont proteges sans appel filesystem", async () => {
  for (const { key } of PROTECTED_HISTORICAL_LOCAL_FILES) {
    const row = localRow({ storageKey: key, filePath: `/uploads/assets/${key}` });
    const { result, localCalls } = await run(row);
    assert.equal(result.status, "protected_historical_file");
    assert.equal(localCalls.inspect, 0);
    assert.equal(localCalls.delete, 0);
  }
});

test("une reference LOCAL partagee bloque toute purge", async () => {
  const duplicate = localRow({ id: "other" });
  const { result, localCalls } = await run(localRow(), { otherRows: [duplicate] });
  assert.equal(result.status, "shared_reference_detected");
  assert.equal(result.sharedReferenceCount, 1);
  assert.equal(localCalls.delete, 0);
});

test("une reference SUPABASE partagee bloque toute purge", async () => {
  const provider = supabaseMock();
  const { result } = await run(supabaseRow(), {
    otherRows: [supabaseRow({ id: "other", deletedAt: null })],
    supabaseProvider: provider.value
  });
  assert.equal(result.status, "shared_reference_detected");
  assert.equal(provider.calls.delete, 0);
});

test("DRY_RUN SUPABASE ne construit ni n'appelle le provider privilegie", async () => {
  let factoryCalls = 0;
  const { prismaClient } = mockPrisma({ rows: [supabaseRow()] });
  const result = await processDeferredAssetFilePurge(
    { assetFileId: "file-1" },
    {
      prismaClient,
      now: () => NOW,
      expectedSupabaseBucket: "asset-files",
      getSupabaseProvider: () => {
        factoryCalls += 1;
        throw new Error("ne doit pas etre appele");
      }
    }
  );
  assert.equal(result.status, "dry_run_complete");
  assert.equal(factoryCalls, 0);
});

test("les metadonnees SUPABASE invalides sont refusees sans appel SDK", async (t) => {
  const cases = [
    { storageBucket: "other" },
    { storageKey: "", filePath: "" },
    { storageKey: "/absolute", filePath: "/absolute" },
    { storageKey: "a\\b", filePath: "a\\b" },
    { storageKey: "a/../b", filePath: "a/../b" },
    { storageKey: "https://example.invalid/x", filePath: "https://example.invalid/x" },
    { storageKey: "a/b?token=x", filePath: "a/b?token=x" },
    { storageKey: "a/b#fragment", filePath: "a/b#fragment" }
  ];
  for (const overrides of cases) {
    await t.test(JSON.stringify(overrides), async () => {
      const provider = supabaseMock();
      const { result } = await run(supabaseRow(overrides), {
        supabaseProvider: provider.value
      });
      assert.equal(result.status, "invalid_metadata");
      assert.equal(provider.calls.delete, 0);
    });
  }
});

test("un provider inconnu produit invalid_provider", async () => {
  assert.equal(
    (await run(localRow({ storageProvider: "OTHER" }))).result.status,
    "invalid_provider"
  );
});

test("EXECUTE LOCAL supprime le binaire exact puis la ligne", async () => {
  const { result, calls, localCalls } = await run(localRow(), {
    mode: ASSET_FILE_PURGE_MODES.EXECUTE
  });
  assert.equal(result.status, "purge_complete");
  assert.equal(result.binaryState, "binary_deleted");
  assert.equal(result.databaseState, "database_row_deleted");
  assert.equal(localCalls.delete, 1);
  assert.deepEqual(localCalls.keys.at(-1), "UNIT/file.txt");
  assert.equal(calls.deleteMany, 1);
});

test("un binaire LOCAL absent autorise la suppression de la ligne", async () => {
  const { result, calls } = await run(localRow(), {
    mode: ASSET_FILE_PURGE_MODES.EXECUTE,
    localOptions: { exists: false }
  });
  assert.equal(result.binaryState, "binary_already_missing");
  assert.equal(calls.deleteMany, 1);
});

test("une erreur filesystem bloque Prisma et preserve la cause", async () => {
  const filesystemError = new Error("synthetic filesystem failure");
  const { prismaClient, calls } = mockPrisma({ rows: [localRow(), localRow()] });
  const local = safeLocalBinary({ deleteError: filesystemError });
  await assert.rejects(
    processDeferredAssetFilePurge(
      { assetFileId: "file-1", mode: "EXECUTE" },
      {
        prismaClient,
        now: () => NOW,
        localBinary: local.value
      }
    ),
    (error) => {
      assert.ok(error instanceof AssetFilePurgeError);
      assert.equal(error.status, "binary_delete_failed");
      assert.equal(error.cause, filesystemError);
      assert.equal(error.message.includes("synthetic"), false);
      return true;
    }
  );
  assert.equal(calls.deleteMany, 0);
});

test("EXECUTE SUPABASE supprime une seule cle exacte puis la ligne", async () => {
  const provider = supabaseMock();
  const { result, calls } = await run(supabaseRow(), {
    mode: "EXECUTE",
    supabaseProvider: provider.value
  });
  assert.equal(result.status, "purge_complete");
  assert.equal(provider.calls.delete, 1);
  assert.deepEqual(provider.calls.keys, ["assets/units/unit-1/file.txt"]);
  assert.equal(calls.deleteMany, 1);
});

test("un objet SUPABASE absent confirme autorise la suppression Prisma", async () => {
  const provider = supabaseMock({ deleted: false });
  const { result, calls } = await run(supabaseRow(), {
    mode: "EXECUTE",
    supabaseProvider: provider.value
  });
  assert.equal(result.binaryState, "binary_already_missing");
  assert.equal(calls.deleteMany, 1);
});

test("une absence confirmee avant remove evite remove et autorise Prisma", async () => {
  const provider = supabaseLifecycleMock({ existence: [false] });
  const { result, calls } = await run(supabaseRow(), {
    mode: "EXECUTE",
    supabaseProvider: provider.value
  });
  assert.equal(result.binaryState, "binary_already_missing");
  assert.equal(provider.calls.list, 1);
  assert.equal(provider.calls.delete, 0);
  assert.equal(calls.deleteMany, 1);
});

test("un objet present est supprime une fois avec sa cle exacte", async () => {
  const provider = supabaseLifecycleMock({ existence: [true] });
  const { result, calls } = await run(supabaseRow(), {
    mode: "EXECUTE",
    supabaseProvider: provider.value
  });
  assert.equal(result.binaryState, "binary_deleted");
  assert.deepEqual(provider.calls.deletedKeys, ["assets/units/unit-1/file.txt"]);
  assert.equal(calls.deleteMany, 1);
});

test("HTTP 400 puis absence confirmee autorise Prisma", async () => {
  const provider = supabaseLifecycleMock({
    existence: [true, false],
    deleteError: Object.assign(new Error("ambiguous delete"), { status: 400 })
  });
  const { result, calls } = await run(supabaseRow(), {
    mode: "EXECUTE",
    supabaseProvider: provider.value
  });
  assert.equal(result.binaryState, "binary_already_missing");
  assert.equal(provider.calls.delete, 1);
  assert.equal(provider.calls.list, 2);
  assert.equal(calls.deleteMany, 1);
});

test("HTTP 400 avec objet encore present bloque Prisma", async () => {
  const provider = supabaseLifecycleMock({
    existence: [true, true],
    deleteError: Object.assign(new Error("ambiguous delete"), { status: 400 })
  });
  const { prismaClient, calls } = mockPrisma({
    rows: [supabaseRow(), supabaseRow()]
  });
  await assert.rejects(
    processDeferredAssetFilePurge(
      { assetFileId: "file-1", mode: "EXECUTE" },
      {
        prismaClient,
        now: () => NOW,
        expectedSupabaseBucket: "asset-files",
        supabaseProvider: provider.value
      }
    ),
    (error) => error.status === "binary_delete_failed"
  );
  assert.equal(calls.deleteMany, 0);
});

test("HTTP 400 avec verification secondaire inconnue bloque Prisma", async () => {
  const provider = supabaseLifecycleMock({
    existence: [true, new Error("inventory unavailable")],
    deleteError: Object.assign(new Error("ambiguous delete"), { status: 400 })
  });
  const { prismaClient, calls } = mockPrisma({
    rows: [supabaseRow(), supabaseRow()]
  });
  await assert.rejects(
    processDeferredAssetFilePurge(
      { assetFileId: "file-1", mode: "EXECUTE" },
      {
        prismaClient,
        now: () => NOW,
        expectedSupabaseBucket: "asset-files",
        supabaseProvider: provider.value
      }
    ),
    (error) => error.status === "binary_delete_failed"
  );
  assert.equal(calls.deleteMany, 0);
});

test("une verification initiale inconnue peut etre suivie d'un remove reussi", async () => {
  const provider = supabaseLifecycleMock({
    existence: [new Error("inventory unavailable")]
  });
  const { result, calls } = await run(supabaseRow(), {
    mode: "EXECUTE",
    supabaseProvider: provider.value
  });
  assert.equal(result.binaryState, "binary_deleted");
  assert.equal(provider.calls.delete, 1);
  assert.equal(calls.deleteMany, 1);
});

test("une erreur reseau et une verification secondaire inconnue bloquent Prisma", async () => {
  const provider = supabaseLifecycleMock({
    existence: [
      new Error("inventory unavailable"),
      new Error("inventory still unavailable")
    ],
    deleteError: new Error("network unavailable")
  });
  const { prismaClient, calls } = mockPrisma({
    rows: [supabaseRow(), supabaseRow()]
  });
  await assert.rejects(
    processDeferredAssetFilePurge(
      { assetFileId: "file-1", mode: "EXECUTE" },
      {
        prismaClient,
        now: () => NOW,
        expectedSupabaseBucket: "asset-files",
        supabaseProvider: provider.value
      }
    ),
    (error) => {
      assert.equal(error.status, "binary_delete_failed");
      assert.equal(error.message.includes("network unavailable"), false);
      return true;
    }
  );
  assert.equal(calls.deleteMany, 0);
});

test("une erreur SUPABASE bloque Prisma et ne fuite pas la cause", async () => {
  const sdkError = new Error("test-only-secret network details");
  const provider = supabaseMock({ error: sdkError });
  const { prismaClient, calls } = mockPrisma({ rows: [supabaseRow(), supabaseRow()] });
  await assert.rejects(
    processDeferredAssetFilePurge(
      { assetFileId: "file-1", mode: "EXECUTE" },
      {
        prismaClient,
        now: () => NOW,
        expectedSupabaseBucket: "asset-files",
        supabaseProvider: provider.value
      }
    ),
    (error) => {
      assert.equal(error.status, "binary_delete_failed");
      assert.equal(error.cause, sdkError);
      assert.equal(error.message.includes("test-only-secret"), false);
      return true;
    }
  );
  assert.equal(calls.deleteMany, 0);
});

test("une restauration ou modification avant revalidation bloque l'effet", async (t) => {
  for (const second of [
    localRow({ deletedAt: null }),
    localRow({ updatedAt: new Date("2026-07-01T00:00:00.000Z") })
  ]) {
    await t.test(String(second.deletedAt), async () => {
      const local = safeLocalBinary();
      const { prismaClient, calls } = mockPrisma({ rows: [localRow(), second] });
      const result = await processDeferredAssetFilePurge(
        { assetFileId: "file-1", mode: "EXECUTE" },
        { prismaClient, now: () => NOW, localBinary: local.value }
      );
      assert.ok(["not_deleted", "invalid_metadata"].includes(result.status));
      assert.equal(local.calls.delete, 0);
      assert.equal(calls.deleteMany, 0);
    });
  }
});

test("un echec Prisma apres suppression physique preserve l'erreur principale", async () => {
  const prismaError = new Error("synthetic prisma failure");
  const { prismaClient } = mockPrisma({
    rows: [localRow(), localRow()],
    deleteError: prismaError
  });
  await assert.rejects(
    processDeferredAssetFilePurge(
      { assetFileId: "file-1", mode: "EXECUTE" },
      { prismaClient, now: () => NOW, localBinary: safeLocalBinary().value }
    ),
    (error) => {
      assert.equal(error.status, "database_delete_failed");
      assert.equal(error.cause, prismaError);
      assert.equal(error.result.binaryState, "binary_deleted");
      return true;
    }
  );
});

test("une suppression Prisma conditionnelle a zero ligne est controlee", async () => {
  const { prismaClient } = mockPrisma({
    rows: [localRow(), localRow()],
    deleteCount: 0
  });
  await assert.rejects(
    processDeferredAssetFilePurge(
      { assetFileId: "file-1", mode: "EXECUTE" },
      { prismaClient, now: () => NOW, localBinary: safeLocalBinary().value }
    ),
    (error) => error.status === "database_delete_failed"
  );
});

test("une deuxieme demande apres purge complete ne rappelle pas le binaire", async () => {
  const rows = [localRow(), localRow(), null];
  const mocked = mockPrisma({ rows });
  const local = safeLocalBinary();
  const dependencies = {
    prismaClient: mocked.prismaClient,
    now: () => NOW,
    localBinary: local.value
  };
  const first = await processDeferredAssetFilePurge(
    { assetFileId: "file-1", mode: "EXECUTE" },
    dependencies
  );
  const second = await processDeferredAssetFilePurge(
    { assetFileId: "file-1", mode: "EXECUTE" },
    dependencies
  );
  assert.equal(first.status, "purge_complete");
  assert.equal(second.status, "asset_file_not_found");
  assert.equal(local.calls.delete, 1);
});

test("les operations filesystem reelles restent bornees au repertoire temporaire", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "phase10d-g-b-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const operations = createSafeLocalBinaryOperations({ rootDirectory: root });
  await mkdir(path.join(root, "UNIT"), { recursive: true });
  await writeFile(path.join(root, "UNIT", "file.txt"), "synthetic");
  assert.equal((await operations.inspect("UNIT/file.txt")).exists, true);
  assert.equal(await operations.delete("UNIT/file.txt"), true);
  assert.equal(await operations.delete("UNIT/file.txt"), false);
  await mkdir(path.join(root, "UNIT", "folder"), { recursive: true });
  await assert.rejects(operations.delete("UNIT/folder"), /pas un fichier/);
});

test("un lien symbolique LOCAL est refuse sans suppression", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "phase10d-g-b-link-"));
  const outside = await mkdtemp(path.join(tmpdir(), "phase10d-g-b-outside-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, "target.txt"), "protected");
  try {
    await symlink(path.join(outside, "target.txt"), path.join(root, "link.txt"), "file");
  } catch (error) {
    if (error?.code !== "EPERM") throw error;
    await symlink(outside, path.join(root, "link.txt"), "junction");
  }
  const operations = createSafeLocalBinaryOperations({ rootDirectory: root });
  try {
    await operations.delete("link.txt");
    assert.fail("Le lien symbolique aurait du etre refuse.");
  } catch (error) {
    assert.match(error.message, /symbolique/);
  }
  assert.equal(
    await import("node:fs/promises").then(({ readFile }) =>
      readFile(path.join(outside, "target.txt"), "utf8")
    ),
    "protected"
  );
});
