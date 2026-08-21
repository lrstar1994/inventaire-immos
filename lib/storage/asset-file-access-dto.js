import "server-only";

import { resolveAssetFileAccess } from "./asset-file-access.js";
import { StorageValidationError } from "./errors.js";

const AVAILABLE = "available";
const INVALID = "invalid";
const UNAVAILABLE = "unavailable";

function safeProvider(value) {
  return value === "LOCAL" || value === "SUPABASE" ? value : null;
}

function publicAssetFileFields(assetFile) {
  const {
    storageProvider: _storageProvider,
    storageBucket: _storageBucket,
    storageKey: _storageKey,
    filePath: _filePath,
    ...publicFields
  } = assetFile;

  return publicFields;
}

export async function toAssetFileAccessDto(
  assetFile,
  { resolveAccess = resolveAssetFileAccess } = {},
) {
  const publicFields = publicAssetFileFields(assetFile);

  try {
    const access = await resolveAccess(assetFile);

    return {
      ...publicFields,
      provider: access.provider,
      accessUrl: access.url,
      accessExpiresAt: access.expiresAt?.toISOString() ?? null,
      accessStatus: AVAILABLE,
      accessMessage: null,
    };
  } catch (error) {
    const invalid = error instanceof StorageValidationError;

    return {
      ...publicFields,
      provider: safeProvider(assetFile?.storageProvider),
      accessUrl: null,
      accessExpiresAt: null,
      accessStatus: invalid ? INVALID : UNAVAILABLE,
      accessMessage: invalid
        ? "Métadonnées de fichier invalides."
        : "Fichier indisponible.",
    };
  }
}

export function toAssetFileAccessDtos(assetFiles, options) {
  return Promise.all(
    assetFiles.map((assetFile) => toAssetFileAccessDto(assetFile, options)),
  );
}

export async function toAssetUnitsAccessDtos(assetUnits, options) {
  return Promise.all(
    assetUnits.map(async (assetUnit) => {
      const entry = assetUnit.entry
        ? {
            ...assetUnit.entry,
            assetFiles: await toAssetFileAccessDtos(assetUnit.entry.assetFiles ?? [], options),
          }
        : assetUnit.entry;
      return {
        ...assetUnit,
        entry,
        assetFiles: await toAssetFileAccessDtos(assetUnit.assetFiles ?? [], options),
      };
    }),
  );
}
