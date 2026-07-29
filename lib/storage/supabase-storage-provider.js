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
    const response = await this.fetchImplementation(this.objectUrl(normalized), {
      method: "HEAD",
      headers: this.requestHeaders()
    });
    if (response.status === 404) return false;
    if (!response.ok) throw new StorageProviderError(`Verification Storage refusee (HTTP ${response.status}).`);
    return true;
  }
}
