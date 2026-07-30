import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { access, link, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  StorageConflictError,
  StorageObjectNotFoundError,
  StorageProviderError
} from "./errors.js";
import { normalizeStorageKey } from "./storage-key.js";

function isMissing(error) {
  return error?.code === "ENOENT";
}

export class LocalFileStorageProvider {
  name = "local";

  constructor({
    rootDirectory = process.env.LOCAL_ASSET_UPLOAD_DIR || path.join(process.cwd(), "public", "uploads", "assets"),
    publicPrefix = "/uploads/assets"
  } = {}) {
    this.rootDirectory = path.resolve(rootDirectory);
    this.publicPrefix = publicPrefix.replace(/\/+$/, "");
  }

  resolvePath(storageKey) {
    const normalized = normalizeStorageKey(storageKey);
    const target = path.resolve(this.rootDirectory, ...normalized.split("/"));
    const relative = path.relative(this.rootDirectory, target);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new StorageProviderError("Resolution de chemin de stockage refusee.");
    }
    return { normalized, target };
  }

  async putObject({ storageKey, bytes, contentType, size }) {
    const { normalized, target } = this.resolvePath(storageKey);
    const buffer = Buffer.from(bytes);
    if (buffer.length !== size) throw new StorageProviderError("La taille du fichier ne correspond pas aux octets recus.");
    await mkdir(path.dirname(target), { recursive: true });
    if (await this.objectExists(normalized)) throw new StorageConflictError();

    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, buffer, { flag: "wx" });
      try {
        await link(temporary, target);
        await unlink(temporary);
      } catch (error) {
        if (error?.code === "EEXIST") throw new StorageConflictError(undefined, { cause: error });
        throw error;
      }
    } catch (error) {
      await unlink(temporary).catch(() => {});
      if (error instanceof StorageConflictError) throw error;
      throw new StorageProviderError("Ecriture du fichier local impossible.", { cause: error });
    }

    return {
      provider: "LOCAL",
      bucket: null,
      key: normalized,
      filePath: `${this.publicPrefix}/${normalized}`,
      storageKey: normalized,
      size: buffer.length,
      contentType,
      checksum: createHash("sha256").update(buffer).digest("hex"),
      databasePath: `${this.publicPrefix}/${normalized}`
    };
  }

  async getObject(storageKey) {
    const { normalized, target } = this.resolvePath(storageKey);
    try {
      const [bytes, info] = await Promise.all([readFile(target), stat(target)]);
      return {
        provider: this.name,
        storageKey: normalized,
        bytes,
        size: info.size,
        contentType: "application/octet-stream"
      };
    } catch (error) {
      if (isMissing(error)) throw new StorageObjectNotFoundError();
      throw new StorageProviderError("Lecture du fichier local impossible.", { cause: error });
    }
  }

  async getDownloadDescriptor(storageKey) {
    const normalized = normalizeStorageKey(storageKey);
    if (!(await this.objectExists(normalized))) throw new StorageObjectNotFoundError();
    return {
      provider: this.name,
      storageKey: normalized,
      url: `${this.publicPrefix}/${normalized}`,
      expiresAt: null
    };
  }

  async createSignedDownloadUrl(storageKey) {
    return this.getDownloadDescriptor(storageKey);
  }

  async deleteObject(storageKey) {
    const { target } = this.resolvePath(storageKey);
    try {
      await unlink(target);
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw new StorageProviderError("Suppression du fichier local impossible.", { cause: error });
    }
  }

  async objectExists(storageKey) {
    const { target } = this.resolvePath(storageKey);
    try {
      await access(target);
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw new StorageProviderError("Verification du fichier local impossible.", { cause: error });
    }
  }
}
