import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const SERVER_ONLY_LOADER = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export%20default%20undefined", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`;

register(`data:text/javascript,${encodeURIComponent(SERVER_ONLY_LOADER)}`);

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
const FILE_NAME = "phase9c-storage-probe.png";
const CONTENT_TYPE = "image/png";
const SIGNED_URL_EXPIRY_SECONDS = 300;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function logStep(step, details = {}) {
  process.stdout.write(`${JSON.stringify({ step, at: new Date().toISOString(), ...details })}\n`);
}

function maskedOrigin(url) {
  const parsed = new URL(url);
  const labels = parsed.hostname.split(".");
  const visibleSuffix = labels.slice(-2).join(".");
  return `${parsed.protocol}//***.${visibleSuffix}`;
}

async function timed(operation) {
  const startedAt = performance.now();
  const value = await operation();
  return { value, durationMs: Math.round(performance.now() - startedAt) };
}

async function main() {
  const env = await loadSupabaseEnv();
  const probeId = randomUUID();
  const storageKey = `diagnostics/phase9c-quater/${probeId}/${FILE_NAME}`;
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "immos-phase9c-"));
  const temporarySource = path.join(temporaryDirectory, FILE_NAME);
  let provider;
  let waitForObjectAbsence;
  let uploadMayExist = false;
  let cleanupSucceeded = false;
  let absenceResult = null;
  let scenarioSucceeded = false;

  try {
    process.env.APP_FILE_STORAGE_PROVIDER = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_STORAGE_BUCKET = env.SUPABASE_STORAGE_BUCKET;

    const [
      { getFileStorageProvider },
      { validateAssetFileBytes, validateAssetFileMetadata },
      storageModule
    ] = await Promise.all([
      import("../lib/storage/get-file-storage-provider.js"),
      import("../lib/storage/file-validation.js"),
      import("../lib/storage/supabase-storage-provider.js")
    ]);
    waitForObjectAbsence = storageModule.waitForObjectAbsence;

    provider = getFileStorageProvider("supabase");
    const configuration = provider.getConfiguration();
    if (provider.name !== "supabase") throw new Error("Le provider Supabase n'est pas actif.");
    if (configuration.bucket !== "asset-files") throw new Error("Bucket Storage inattendu.");

    await writeFile(temporarySource, PNG_BYTES, { flag: "wx" });
    const sourceBytes = await readFile(temporarySource);
    const sourceHash = sha256(sourceBytes);
    validateAssetFileMetadata({
      fileName: FILE_NAME,
      contentType: CONTENT_TYPE,
      size: sourceBytes.length
    });
    validateAssetFileBytes(sourceBytes, CONTENT_TYPE);
    logStep("validated", {
      provider: provider.name,
      bucket: configuration.bucket,
      storageKey,
      fileName: FILE_NAME,
      contentType: CONTENT_TYPE,
      size: sourceBytes.length,
      sha256: sourceHash
    });

    const existsBeforeUpload = await provider.objectExists(storageKey);
    if (existsBeforeUpload) throw new Error("La cle technique existe deja avant l'upload.");
    logStep("absence-before-upload-verified", { exists: false });
    const listedBeforeUpload = await provider.isObjectListed(storageKey);
    if (listedBeforeUpload) throw new Error("La cle technique est deja inventoriee avant l'upload.");
    logStep("inventory-before-upload-verified", { listed: false });

    uploadMayExist = true;
    const upload = await timed(() => provider.putObject({
      storageKey,
      bytes: sourceBytes,
      contentType: CONTENT_TYPE,
      originalFilename: FILE_NAME,
      size: sourceBytes.length
    }));
    if (upload.value.storageKey !== storageKey || upload.value.checksum !== sourceHash) {
      throw new Error("Le resultat d'upload ne correspond pas a la source.");
    }
    logStep("uploaded", { durationMs: upload.durationMs, size: upload.value.size });

    const exists = await provider.objectExists(storageKey);
    if (!exists) throw new Error("L'objet uploade est introuvable.");
    const listedAfterUpload = await provider.isObjectListed(storageKey);
    if (!listedAfterUpload) throw new Error("L'objet uploade n'apparait pas dans l'inventaire.");
    const stored = await provider.getObject(storageKey);
    if (stored.size !== sourceBytes.length || sha256(stored.bytes) !== sourceHash ||
        !stored.bytes.equals(sourceBytes)) {
      throw new Error("Le contenu Storage ne correspond pas a la source.");
    }
    logStep("presence-verified", {
      exists,
      size: stored.size,
      contentType: stored.contentType,
      sha256: sha256(stored.bytes),
      listed: true
    });

    const signed = await timed(() =>
      provider.createSignedDownloadUrl(storageKey, SIGNED_URL_EXPIRY_SECONDS)
    );
    const signedUrl = new URL(signed.value.url);
    logStep("signed-url-created", {
      durationMs: signed.durationMs,
      origin: maskedOrigin(signedUrl),
      signedParametersPresent: Boolean(signedUrl.search),
      expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS
    });

    const download = await timed(() => fetch(signed.value.url, { redirect: "error" }));
    const downloadedBytes = Buffer.from(await download.value.arrayBuffer());
    if (!download.value.ok || downloadedBytes.length !== sourceBytes.length ||
        sha256(downloadedBytes) !== sourceHash || !downloadedBytes.equals(sourceBytes)) {
      throw new Error(`Lecture signee non conforme (HTTP ${download.value.status}).`);
    }
    logStep("signed-download-verified", {
      durationMs: download.durationMs,
      httpStatus: download.value.status,
      contentType: download.value.headers.get("content-type"),
      contentLength: download.value.headers.get("content-length"),
      receivedBytes: downloadedBytes.length,
      sha256: sha256(downloadedBytes),
      byteForByteEqual: true
    });

    const publicUrl = `${configuration.url}/storage/v1/object/public/` +
      `${encodeURIComponent(configuration.bucket)}/` +
      storageKey.split("/").map(encodeURIComponent).join("/");
    const publicAccess = await timed(() => fetch(publicUrl, { redirect: "error" }));
    if (publicAccess.value.ok) throw new Error("L'objet prive est accessible sans signature.");
    logStep("unsigned-public-access-denied", {
      durationMs: publicAccess.durationMs,
      httpStatus: publicAccess.value.status,
      accessible: false
    });

    scenarioSucceeded = true;
  } finally {
    try {
      if (provider && uploadMayExist) {
        const deletion = await timed(() => provider.deleteObject(storageKey));
        cleanupSucceeded = deletion.value;
        logStep("remote-cleanup", { durationMs: deletion.durationMs, deleted: deletion.value });
        if (cleanupSucceeded) {
          const absence = await timed(() => waitForObjectAbsence(provider, storageKey));
          absenceResult = absence.value;
          logStep("remote-absence-confirmed", {
            durationMs: absence.durationMs,
            attempts: absence.value.attempts,
          elapsedMs: absence.value.elapsedMs,
          totalDelayMs: absence.value.totalDelayMs,
          verificationMethod: absence.value.verificationMethod,
          observations: absence.value.observations,
          firstObservationListed: absence.value.observations[0],
            absent: absence.value.absent
          });
        }
      }
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
      logStep("local-cleanup", { removed: true });
    }
  }

  if (!scenarioSucceeded || !cleanupSucceeded || !absenceResult?.absent) {
    throw new Error("Le scenario ou son nettoyage n'est pas entierement valide.");
  }
  logStep("completed", {
    success: true,
    objectAbsent: true,
    attempts: absenceResult.attempts,
    elapsedMs: absenceResult.elapsedMs,
    totalDelayMs: absenceResult.totalDelayMs,
    verificationMethod: absenceResult.verificationMethod,
    storageKey
  });
}

main().catch((error) => {
  const code = typeof error?.code === "string" ? error.code : "PHASE9C_PROBE_FAILED";
  process.stderr.write(`${JSON.stringify({
    step: "failed",
    at: new Date().toISOString(),
    code,
    message: String(error?.message || "Erreur inconnue")
  })}\n`);
  process.exitCode = 1;
});
