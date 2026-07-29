import path from "node:path";
import { ACCEPTED_ASSET_FILE_EXTENSIONS } from "../asset-file-constants.js";
import { StorageValidationError } from "./errors.js";

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;
const SAFE_KEY_SEGMENT = /^[A-Za-z0-9_.-]+$/;

export function normalizeFileExtension(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/^\.+/, "");
  if (!normalized || !ACCEPTED_ASSET_FILE_EXTENSIONS.includes(`.${normalized}`)) {
    throw new StorageValidationError("Extension de fichier non autorisee.");
  }
  return normalized;
}

export function assertSafeStorageSegment(value, label = "identifiant") {
  const normalized = String(value || "").trim();
  if (!normalized || !SAFE_SEGMENT.test(normalized)) {
    throw new StorageValidationError(`${label} de stockage invalide.`);
  }
  return normalized;
}

export function normalizeStorageKey(value) {
  const raw = String(value || "").trim().replaceAll("\\", "/");
  if (!raw || raw.startsWith("/") || path.win32.isAbsolute(raw) || path.posix.isAbsolute(raw)) {
    throw new StorageValidationError("Cle de stockage absolue interdite.");
  }
  const segments = raw.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || !SAFE_KEY_SEGMENT.test(segment))) {
    throw new StorageValidationError("Cle de stockage invalide.");
  }
  return segments.join("/");
}

export function buildAssetUnitStorageKey({ assetUnitId, fileId, extension }) {
  const safeAssetUnitId = assertSafeStorageSegment(assetUnitId, "assetUnitId");
  const safeFileId = assertSafeStorageSegment(fileId, "fileId");
  const safeExtension = normalizeFileExtension(extension);
  return `assets/units/${safeAssetUnitId}/${safeFileId}/${safeFileId}.${safeExtension}`;
}
