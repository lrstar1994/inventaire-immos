import "server-only";

import { createHash } from "node:crypto";
import {
  DEFAULT_SIGNED_URL_EXPIRY_SECONDS,
  readSupabaseStorageConfiguration
} from "./config.js";
import {
  StorageConflictError,
  StorageObjectNotFoundError,
  StorageProviderError
} from "./errors.js";
import { normalizeStorageKey } from "./storage-key.js";

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

  constructor({ env = process.env, fetchImplementation = globalThis.fetch } = {}) {
    this.env = env;
    this.fetchImplementation = fetchImplementation;
    this.configuration = null;
  }

  getConfiguration() {
    this.configuration ||= readSupabaseStorageConfiguration(this.env);
    return this.configuration;
  }

  requestHeaders(extra = {}) {
    const { serviceRoleKey } = this.getConfiguration();
    return {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...extra
    };
  }

  objectUrl(storageKey, suffix = "object") {
    const { url, bucket } = this.getConfiguration();
    const encodedKey = normalizeStorageKey(storageKey).split("/").map(encodeURIComponent).join("/");
    return `${url}/storage/v1/${suffix}/${encodeURIComponent(bucket)}/${encodedKey}`;
  }

  objectListUrl() {
    const { url, bucket } = this.getConfiguration();
    return `${url}/storage/v1/object/list/${encodeURIComponent(bucket)}`;
  }

  async putObject({ storageKey, bytes, contentType, size, cacheControl }) {
    const normalized = normalizeStorageKey(storageKey);
    const buffer = Buffer.from(bytes);
    if (buffer.length !== size) throw new StorageProviderError("La taille du fichier ne correspond pas aux octets recus.");
    const response = await this.fetchImplementation(this.objectUrl(normalized), {
      method: "POST",
      headers: this.requestHeaders({
        "content-type": contentType,
        "x-upsert": "false",
        ...(cacheControl ? { "cache-control": cacheControl } : {})
      }),
      body: buffer
    });
    if (response.status === 409) throw new StorageConflictError();
    if (!response.ok) throw new StorageProviderError(`Ecriture Storage refusee (HTTP ${response.status}).`);
    return {
      provider: this.name,
      storageKey: normalized,
      size: buffer.length,
      contentType,
      checksum: createHash("sha256").update(buffer).digest("hex"),
      databasePath: normalized
    };
  }

  async getObject(storageKey) {
    const normalized = normalizeStorageKey(storageKey);
    const response = await this.fetchImplementation(this.objectUrl(normalized), {
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
    const response = await this.fetchImplementation(this.objectUrl(normalized, "object/sign"), {
      method: "POST",
      headers: this.requestHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ expiresIn: expiresInSeconds })
    });
    if (response.status === 404) throw new StorageObjectNotFoundError();
    if (!response.ok) throw new StorageProviderError(`Creation d'URL signee refusee (HTTP ${response.status}).`);
    const body = await response.json();
    const signedPath = body.signedURL || body.signedUrl;
    if (!signedPath) throw new StorageProviderError("Reponse d'URL signee invalide.");
    const { url } = this.getConfiguration();
    return {
      provider: this.name,
      storageKey: normalized,
      url: signedPath.startsWith("http") ? signedPath : `${url}/storage/v1${signedPath}`,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000)
    };
  }

  async deleteObject(storageKey) {
    const normalized = normalizeStorageKey(storageKey);
    const response = await this.fetchImplementation(this.objectUrl(normalized), {
      method: "DELETE",
      headers: this.requestHeaders()
    });
    if (response.status === 404) return false;
    if (!response.ok) throw new StorageProviderError(`Suppression Storage refusee (HTTP ${response.status}).`);
    return true;
  }

  async objectExists(storageKey) {
    const normalized = normalizeStorageKey(storageKey);
    const objectUrl = this.objectUrl(normalized);
    const response = await this.fetchImplementation(objectUrl, {
      method: "HEAD",
      headers: this.requestHeaders()
    });
    if (await isConfirmedMissingObjectResponse(response)) return false;
    if (response.status === 400) {
      const confirmation = await this.fetchImplementation(objectUrl, {
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
      const response = await this.fetchImplementation(this.objectListUrl(), {
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
