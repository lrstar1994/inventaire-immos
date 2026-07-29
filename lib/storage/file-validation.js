import path from "node:path";
import {
  ACCEPTED_ASSET_FILE_EXTENSIONS,
  ACCEPTED_ASSET_FILE_MIME_TYPES,
  MAX_ASSET_FILE_SIZE
} from "../asset-file-constants.js";
import { StorageValidationError } from "./errors.js";

const MIME_BY_EXTENSION = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".pdf", "application/pdf"]
]);

export function extensionForFilename(fileName) {
  return path.extname(String(fileName || "")).toLowerCase();
}

export function sanitizeOriginalFilename(value) {
  const baseName = path.basename(String(value || "file"))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return (baseName || "file").slice(0, 255);
}

export function validateAssetFileMetadata({ fileName, contentType, size }) {
  if (!Number.isInteger(size) || size <= 0) {
    throw new StorageValidationError("Le fichier est vide ou sa taille est invalide.");
  }
  if (size > MAX_ASSET_FILE_SIZE) {
    const error = new StorageValidationError("Fichier trop lourd. Taille maximale autorisee : 10 Mo.");
    error.status = 413;
    throw error;
  }
  const extension = extensionForFilename(fileName);
  if (!ACCEPTED_ASSET_FILE_EXTENSIONS.includes(extension) ||
      !ACCEPTED_ASSET_FILE_MIME_TYPES.includes(contentType) ||
      MIME_BY_EXTENSION.get(extension) !== contentType) {
    const error = new StorageValidationError(
      "Format non accepte. Formats autorises : jpg, jpeg, png, webp, pdf."
    );
    error.status = 415;
    throw error;
  }
  return { extension, originalFilename: sanitizeOriginalFilename(fileName) };
}

export function detectAssetFileMime(bytes) {
  const buffer = Buffer.from(bytes);
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

export function validateAssetFileBytes(bytes, expectedMimeType) {
  const buffer = Buffer.from(bytes);
  if (buffer.length === 0) throw new StorageValidationError("Le fichier est vide.");
  const detected = detectAssetFileMime(buffer);
  if (!detected || detected !== expectedMimeType) {
    const error = new StorageValidationError("Le contenu du fichier ne correspond pas au format annonce.");
    error.status = 415;
    throw error;
  }
  return detected;
}
