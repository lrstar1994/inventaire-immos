import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertActiveDatabaseSchema, prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import {
  ACCEPTED_ASSET_FILE_EXTENSIONS,
  ASSET_FILE_TYPES,
  MAX_ASSET_FILE_SIZE,
  isAssetFileType,
  isImageMimeType
} from "@/lib/asset-file-constants";
import { canManageAssetFiles } from "@/lib/roles";
import {
  extensionForFilename,
  validateAssetFileBytes,
  validateAssetFileMetadata
} from "@/lib/storage/file-validation";
import { getFileStorageProvider } from "@/lib/storage";
import {
  persistWithStorageCompensation,
  storedObjectToAssetFileData
} from "@/lib/storage/asset-storage-metadata";

export function assetFileInclude() {
  return {
    assetUnit: {
      select: {
        id: true,
        assetCode: true,
        assetItem: { select: { id: true, name: true, code: true } }
      }
    }
  };
}

function cleanName(value) {
  return String(value || "file")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function validateUploadFile(file) {
  if (!file || typeof file.arrayBuffer !== "function") {
    const error = new Error("Fichier obligatoire.");
    error.status = 400;
    throw error;
  }
  return validateAssetFileMetadata({ fileName: file.name, contentType: file.type, size: file.size });
}

function assertMaintenanceUpload(actor, fileType, mimeType, isPrimary) {
  if (canManageAssetFiles(actor.role)) return;
  if (actor.role !== "MAINTENANCE_MANAGER") {
    const error = new Error("Utilisateur non autorise.");
    error.status = 403;
    throw error;
  }
  if (fileType !== "DEFECT_PHOTO" || !isImageMimeType(mimeType) || isPrimary) {
    const error = new Error("Le responsable maintenance peut seulement ajouter une photo de defaut, sans la definir comme photo principale.");
    error.status = 403;
    throw error;
  }
}

export async function saveAssetFileFromForm(formData, actor) {
  const assetUnitId = String(formData.get("assetUnitId") || "");
  const fileType = String(formData.get("fileType") || "OTHER");
  const fileLabel = String(formData.get("fileLabel") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const file = formData.get("file");
  const wantsPrimary = formData.get("isPrimary") === "true" || fileType === "MAIN_PHOTO";

  if (!isAssetFileType(fileType)) {
    const error = new Error("Type de fichier non accepte.");
    error.status = 400;
    throw error;
  }
  validateUploadFile(file);
  assertMaintenanceUpload(actor, fileType, file.type, wantsPrimary);

  const assetUnit = await prisma.assetUnit.findFirst({
    where: { id: assetUnitId, deletedAt: null, status: { not: "RETIRED" } }
  });
  if (!assetUnit) {
    const error = new Error("Bien introuvable.");
    error.status = 404;
    throw error;
  }

  const extension = extensionForFilename(file.name);
  const storedName = `${assetUnit.assetCode}-${randomUUID()}-${cleanName(path.basename(file.name, extension))}${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  validateAssetFileBytes(bytes, file.type);
  const storage = getFileStorageProvider();
  const storedObject = await storage.putObject({
    storageKey: `${assetUnit.assetCode}/${storedName}`,
    bytes,
    contentType: file.type,
    originalFilename: file.name,
    size: file.size
  });

  const storageMetadata = storedObjectToAssetFileData(storedObject);
  return persistWithStorageCompensation({
    storage,
    storedObject,
    persist: () => prisma.$transaction(async (tx) => {
      await assertActiveDatabaseSchema(tx);
      if (wantsPrimary && isImageMimeType(file.type)) {
        await tx.assetFile.updateMany({
          where: { assetUnitId, deletedAt: null, isPrimary: true },
          data: { isPrimary: false }
        });
      }
      const created = await tx.assetFile.create({
        data: {
          assetUnitId,
          fileType,
          fileLabel,
          fileName: file.name,
          filePath: storageMetadata.filePath,
          storageProvider: storageMetadata.storageProvider,
          storageBucket: storageMetadata.storageBucket,
          storageKey: storageMetadata.storageKey,
          mimeType: file.type,
          fileSize: file.size,
          isPrimary: wantsPrimary && isImageMimeType(file.type),
          notes,
          createdById: actor.id
        },
        include: assetFileInclude()
      });
      await tx.auditLog.create({
        data: {
          action: "ASSET_FILE_UPLOADED",
          entityTable: "asset_files",
          entityId: created.id,
          summary: `Fichier ajoute au bien ${assetUnit.assetCode}`,
          metadata: JSON.stringify({
            assetUnitId,
            fileType,
            filePath: storageMetadata.filePath,
            storageProvider: storageMetadata.storageProvider,
            storageBucket: storageMetadata.storageBucket,
            storageKey: storageMetadata.storageKey
          }),
          userId: actor.id
        }
      });
      if (created.isPrimary) {
        await tx.auditLog.create({
          data: {
            action: "ASSET_FILE_SET_PRIMARY",
            entityTable: "asset_files",
            entityId: created.id,
            summary: `Photo principale definie pour ${assetUnit.assetCode}`,
            metadata: JSON.stringify({ assetUnitId }),
            userId: actor.id
          }
        });
      }
      return created;
    })
  });
}

export async function updateAssetFile(id, body, actor) {
  if (!canManageAssetFiles(actor.role)) {
    const error = new Error("Utilisateur non autorise.");
    error.status = 403;
    throw error;
  }

  const current = await prisma.assetFile.findFirst({ where: { id, deletedAt: null } });
  if (!current) {
    const error = new Error("Fichier introuvable.");
    error.status = 404;
    throw error;
  }

  const data = {};
  if (body.fileType !== undefined) {
    if (!isAssetFileType(body.fileType)) throw new Error("Type de fichier non accepte.");
    data.fileType = body.fileType;
  }
  if (body.fileLabel !== undefined) data.fileLabel = String(body.fileLabel || "").trim() || null;
  if (body.notes !== undefined) data.notes = String(body.notes || "").trim() || null;
  if (body.isPrimary !== undefined) {
    if (body.isPrimary && !isImageMimeType(current.mimeType)) throw new Error("Seule une image peut etre definie comme photo principale.");
    data.isPrimary = Boolean(body.isPrimary);
  }

  return prisma.$transaction(async (tx) => {
    await assertActiveDatabaseSchema(tx);
    if (data.isPrimary) {
      await tx.assetFile.updateMany({
        where: { assetUnitId: current.assetUnitId, deletedAt: null, isPrimary: true, id: { not: id } },
        data: { isPrimary: false }
      });
    }
    const updated = await tx.assetFile.update({ where: { id }, data, include: assetFileInclude() });
    await tx.auditLog.create({
      data: {
        action: data.isPrimary ? "ASSET_FILE_SET_PRIMARY" : "ASSET_FILE_UPDATED",
        entityTable: "asset_files",
        entityId: id,
        summary: data.isPrimary ? "Photo principale definie" : "Fichier mis a jour",
        metadata: JSON.stringify({ assetUnitId: current.assetUnitId }),
        userId: actor.id
      }
    });
    return updated;
  });
}

export async function deleteAssetFile(id, actor) {
  if (!canManageAssetFiles(actor.role)) {
    const error = new Error("Utilisateur non autorise.");
    error.status = 403;
    throw error;
  }
  const current = await prisma.assetFile.findFirst({ where: { id, deletedAt: null } });
  if (!current) {
    const error = new Error("Fichier introuvable.");
    error.status = 404;
    throw error;
  }
  const deleted = await prisma.assetFile.update({
    where: { id },
    data: { deletedAt: new Date(), isPrimary: false },
    include: assetFileInclude()
  });
  await writeAuditLog({
    action: "ASSET_FILE_DELETED",
    entityTable: "asset_files",
    entityId: id,
    summary: "Fichier supprime logiquement",
    metadata: { assetUnitId: current.assetUnitId },
    userId: actor.id
  });
  return deleted;
}

export function assetFileOptions() {
  return {
    fileTypes: ASSET_FILE_TYPES,
    acceptedExtensions: ACCEPTED_ASSET_FILE_EXTENSIONS,
    maxFileSize: MAX_ASSET_FILE_SIZE
  };
}
