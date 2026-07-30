import "server-only";

import { createHash } from "node:crypto";
import {
  DEFAULT_SIGNED_URL_EXPIRY_SECONDS
} from "./config.js";
import {
  StorageConflictError,
  StorageObjectNotFoundError,
  StorageProviderError,
  StorageValidationError
} from "./errors.js";
import { normalizeStorageKey } from "./storage-key.js";
import { createSupabaseStorageAdminClientFactory } from "./supabase-storage-admin-client.js";

export const DEFAULT_OBJECT_ABSENCE_DELAYS_MS = Object.freeze([250, 500, 750, 1000]);

async function isConfirmedMissingObjectResponse(response) {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  try {
    const body = await response.json();
    return String(body?.statusCode) === "404" &&
      body?.error === "not_found" &&
      body?.message === "Object not found";
  } catch {
    return false;
  }
}

export async function waitForObjectAbsence(
  provider,
  storageKey,
  {
    delaysMs = DEFAULT_OBJECT_ABSENCE_DELAYS_MS,
    sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    now = Date.now
  } = {}
) {
  if (!provider || typeof provider.isObjectListed !== "function") {
    throw new TypeError("Un provider avec isObjectListed() est requis.");
  }
  if (!Array.isArray(delaysMs) || delaysMs.some((delay) => !Number.isFinite(delay) || delay < 0)) {
    throw new TypeError("Les delais de verification sont invalides.");
  }

  const startedAt = now();
  const observations = [];
  let totalDelayMs = 0;
  for (let index = 0; index <= delaysMs.length; index += 1) {
    if (index > 0) {
      const delayMs = delaysMs[index - 1];
      await sleep(delayMs);
      totalDelayMs += delayMs;
    }
    const listed = await provider.isObjectListed(storageKey);
    observations.push(listed);
    if (!listed) {
      return {
        absent: true,
        attempts: observations.length,
        elapsedMs: Math.max(0, now() - startedAt),
        totalDelayMs,
        verificationMethod: "list",
        observations
      };
    }
  }

  const error = new StorageProviderError(
    "Object still visible after deletion verification timeout."
  );
  error.attempts = observations.length;
  error.elapsedMs = Math.max(0, now() - startedAt);
  error.totalDelayMs = totalDelayMs;
  throw error;
}

export class SupabaseStorageProvider {
  name = "supabase";

  constructor({
    env = process.env,
    fetchImplementation = globalThis.fetch,
    runtime = globalThis,
    adminClient,
    adminClientFactory
  } = {}) {
    this.adminClient = adminClient || null;
    this.getAdminClient = adminClientFactory || createSupabaseStorageAdminClientFactory({
      env,
      fetchImplementation,
      runtime
    });
  }

  client() {
    this.adminClient ||= this.getAdminClient();
    return this.adminClient;
  }

  requestHeaders(extra = {}) {
    return this.client().requestHeaders(extra);
  }

  objectUrl(storageKey, suffix = "object") {
    return this.client().objectUrl(storageKey, suffix);
  }

  objectListUrl() {
    return this.client().objectListUrl();
  }

  async requestForMutation(operation, url, options) {
    try {
      return await this.client().request(url, options);
    } catch {
      throw new StorageProviderError(`${operation} Storage impossible (erreur reseau).`);
    }
  }

  async putObject({ storageKey, bytes, contentType, size, cacheControl }) {
    const normalized = normalizeStorageKey(storageKey);
    let buffer;
    try {
      buffer = Buffer.from(bytes);
    } catch {
      throw new StorageValidationError("Contenu binaire Storage invalide.");
    }
    if (!contentType || !Number.isInteger(size) || size < 0 || buffer.length !== size) {
      throw new StorageValidationError("Metadonnees du contenu Storage invalides.");
    }
    const response = await this.requestForMutation("Upload", this.objectUrl(normalized), {
      method: "POST",
      headers: this.requestHeaders({
        "content-type": contentType,
        "x-upsert": "false",
        ...(cacheControl ? { "cache-control": cacheControl } : {})
      }),
      body: buffer
    });
    if (response.status === 409) throw new StorageConflictError();
    if (response.status === 404) {
      throw new StorageProviderError("Bucket Storage inaccessible (HTTP 404).");
    }
    if ([401, 403].includes(response.status)) {
      throw new StorageProviderError(`Acces Storage refuse (HTTP ${response.status}).`);
    }
    if (!response.ok) throw new StorageProviderError(`Upload Storage refuse (HTTP ${response.status}).`);
    return {
      provider: "SUPABASE",
      bucket: this.client().bucketName,
      key: normalized,
      filePath: normalized,
      storageKey: normalized,
      size: buffer.length,
      contentType,
      checksum: createHash("sha256").update(buffer).digest("hex"),
      databasePath: normalized
    };
  }

  async getObject(storageKey) {
    const normalized = normalizeStorageKey(storageKey);
    const response = await this.client().request(this.objectUrl(normalized), {
      headers: this.requestHeaders()
    });
    if (response.status === 404) throw new StorageObjectNotFoundError();
    if (!response.ok) throw new StorageProviderError(`Lecture Storage refusee (HTTP ${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      provider: this.name,
      storageKey: normalized,
      bytes,
      size: bytes.length,
      contentType: response.headers.get("content-type") || "application/octet-stream"
    };
  }

  async getDownloadDescriptor(storageKey) {
    return this.createSignedDownloadUrl(storageKey);
  }

  async createSignedDownloadUrl(storageKey, expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRY_SECONDS) {
    const normalized = normalizeStorageKey(storageKey);
    const response = await this.client().request(this.objectUrl(normalized, "object/sign"), {
      method: "POST",
      headers: this.requestHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ expiresIn: expiresInSeconds })
    });
    if (response.status === 404) throw new StorageObjectNotFoundError();
    if (!response.ok) throw new StorageProviderError(`Creation d'URL signee refusee (HTTP ${response.status}).`);
    const body = await response.json();
    const signedPath = body.signedURL || body.signedUrl;
    if (!signedPath) throw new StorageProviderError("Reponse d'URL signee invalide.");
    const { projectUrl } = this.client();
    return {
      provider: this.name,
      storageKey: normalized,
      url: signedPath.startsWith("http") ? signedPath : `${projectUrl}/storage/v1${signedPath}`,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000)
    };
  }

  async deleteObject(storageKey) {
    const normalized = normalizeStorageKey(storageKey);
    const response = await this.requestForMutation("Suppression", this.objectUrl(normalized), {
      method: "DELETE",
      headers: this.requestHeaders()
    });
    if (response.status === 404) return false;
    if ([401, 403].includes(response.status)) {
      throw new StorageProviderError(`Acces Storage refuse (HTTP ${response.status}).`);
    }
    if (!response.ok) throw new StorageProviderError(`Suppression Storage refusee (HTTP ${response.status}).`);
    return true;
  }

  async objectExists(storageKey) {
    const normalized = normalizeStorageKey(storageKey);
    const objectUrl = this.objectUrl(normalized);
    const response = await this.client().request(objectUrl, {
      method: "HEAD",
      headers: this.requestHeaders()
    });
    if (await isConfirmedMissingObjectResponse(response)) return false;
    if (response.status === 400) {
      const confirmation = await this.client().request(objectUrl, {
        headers: this.requestHeaders()
      });
      if (await isConfirmedMissingObjectResponse(confirmation)) return false;
      if (confirmation.ok) return true;
      throw new StorageProviderError(
        `Verification Storage refusee (HTTP ${confirmation.status}).`
      );
    }
    if (!response.ok) throw new StorageProviderError(`Verification Storage refusee (HTTP ${response.status}).`);
    return true;
  }

  async isObjectListed(storageKey, { pageSize = 100, maxPages = 1000 } = {}) {
    const normalized = normalizeStorageKey(storageKey);
    if (!Number.isInteger(pageSize) || pageSize <= 0 ||
        !Number.isInteger(maxPages) || maxPages <= 0) {
      throw new TypeError("Parametres de pagination Storage invalides.");
    }
    const segments = normalized.split("/");
    const objectName = segments.pop();
    const prefix = segments.join("/");

    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.client().request(this.objectListUrl(), {
        method: "POST",
        headers: this.requestHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          prefix,
          limit: pageSize,
          offset: page * pageSize,
          sortBy: { column: "name", order: "asc" }
        })
      });
      if (!response.ok) {
        throw new StorageProviderError(`Inventaire Storage refuse (HTTP ${response.status}).`);
      }
      const entries = await response.json();
      if (!Array.isArray(entries)) {
        throw new StorageProviderError("Reponse d'inventaire Storage invalide.");
      }
      if (entries.some((entry) => entry && entry.name === objectName)) return true;
      if (entries.length < pageSize) return false;
    }

    throw new StorageProviderError("Pagination de l'inventaire Storage non terminee.");
  }
}
