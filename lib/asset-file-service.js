import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertActiveDatabaseSchema, prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import {
  ACCEPTED_ASSET_FILE_EXTENSIONS,
  ASSET_FILE_KINDS,
  ASSET_FILE_TYPES,
  MAX_ASSET_FILE_SIZE,
  inferAssetFileKind,
  isAssetFileKind,
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
import { buildAssetEntryStorageKey, buildAssetUnitStorageKey } from "@/lib/storage/storage-key";
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
    },
    assetEntry: {
      select: {
        id: true,
        entryNumber: true,
        quantity: true,
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
  if (!["DEFECT_PHOTO", "VISIBLE_DEFECT"].includes(fileType) || !isImageMimeType(mimeType) || isPrimary) {
    const error = new Error("Le responsable maintenance peut seulement ajouter une photo de defaut, sans la definir comme photo principale.");
    error.status = 403;
    throw error;
  }
}

function assertFileSemantics({ fileKind, fileType, mimeType, isPrimary }) {
  if (!isAssetFileKind(fileKind)) {
    const error = new Error("Catégorie de fichier non acceptée.");
    error.status = 400;
    throw error;
  }
  if (!isAssetFileType(fileType)) {
    const error = new Error("Type de fichier non accepte.");
    error.status = 400;
    throw error;
  }
  if (fileKind === "MATERIAL_PHOTO" && !isImageMimeType(mimeType)) {
    const error = new Error("Une photo de matériel doit être une image.");
    error.status = 400;
    throw error;
  }
  if (fileKind === "MATERIAL_PHOTO" && ["INVOICE", "DELIVERY_NOTE", "WARRANTY", "MANUAL"].includes(fileType)) {
    const error = new Error("Un justificatif ne peut pas être classé comme photo du matériel.");
    error.status = 400;
    throw error;
  }
  if (fileKind === "SUPPORTING_DOCUMENT" && !["INVOICE", "DELIVERY_NOTE", "WARRANTY", "MANUAL", "OTHER"].includes(fileType)) {
    const error = new Error("Ce type de photo ne peut pas être classé comme pièce justificative.");
    error.status = 400;
    throw error;
  }
  if (fileKind === "SUPPORTING_DOCUMENT" && isPrimary) {
    const error = new Error("Une pièce justificative ne peut pas être photo principale.");
    error.status = 400;
    throw error;
  }
}

function ownerWhere(owner) {
  return owner.type === "entry"
    ? { assetEntryId: owner.id }
    : { assetUnitId: owner.id };
}

function ownerData(owner) {
  return owner.type === "entry"
    ? { assetEntryId: owner.id, assetUnitId: null }
    : { assetUnitId: owner.id, assetEntryId: null };
}

function ownerAuditMetadata(owner) {
  return owner.type === "entry"
    ? { assetEntryId: owner.id }
    : { assetUnitId: owner.id };
}

async function saveAssetFileForOwner(formData, actor, owner, { requireFileKind = false } = {}) {
  const fileType = String(formData.get("fileType") || "OTHER");
  const fileLabel = String(formData.get("fileLabel") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const file = formData.get("file");
  const wantsPrimary = formData.get("isPrimary") === "true" || fileType === "MAIN_PHOTO";

  validateUploadFile(file);
  const requestedFileKind = String(formData.get("fileKind") || "");
  const fileKind = requestedFileKind || (!requireFileKind ? inferAssetFileKind(fileType, file.type) : "");
  assertFileSemantics({ fileKind, fileType, mimeType: file.type, isPrimary: wantsPrimary });
  assertMaintenanceUpload(actor, fileType, file.type, wantsPrimary);

  const extension = extensionForFilename(file.name);
  const fileId = randomUUID();
  const storedName = `${owner.code}-${fileId}-${cleanName(path.basename(file.name, extension))}${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  validateAssetFileBytes(bytes, file.type);
  const storage = getFileStorageProvider();
  const storageKey = storage.name === "supabase"
    ? owner.type === "entry"
      ? buildAssetEntryStorageKey({ assetEntryId: owner.id, fileId, extension })
      : buildAssetUnitStorageKey({ assetUnitId: owner.id, fileId, extension })
    : owner.type === "entry"
      ? `entries/${owner.id}/${storedName}`
      : `${owner.code}/${storedName}`;
  const storedObject = await storage.putObject({
    storageKey,
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
      if (wantsPrimary) {
        await tx.assetFile.updateMany({
          where: { ...ownerWhere(owner), deletedAt: null, isPrimary: true },
          data: { isPrimary: false }
        });
      }
      const created = await tx.assetFile.create({
        data: {
          ...ownerData(owner),
          fileKind,
          fileType,
          fileLabel,
          fileName: file.name,
          filePath: storageMetadata.filePath,
          storageProvider: storageMetadata.storageProvider,
          storageBucket: storageMetadata.storageBucket,
          storageKey: storageMetadata.storageKey,
          mimeType: file.type,
          fileSize: file.size,
          isPrimary: wantsPrimary,
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
          summary: `Fichier ajoute à ${owner.label}`,
          metadata: JSON.stringify({
            ...ownerAuditMetadata(owner),
            fileKind,
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
            summary: `Photo principale definie pour ${owner.label}`,
            metadata: JSON.stringify(ownerAuditMetadata(owner)),
            userId: actor.id
          }
        });
      }
      return created;
    })
  });
}

export async function saveAssetFileFromForm(formData, actor) {
  const assetUnitId = String(formData.get("assetUnitId") || "");
  const assetUnit = await prisma.assetUnit.findFirst({
    where: { id: assetUnitId, deletedAt: null, status: { not: "RETIRED" } }
  });
  if (!assetUnit) {
    const error = new Error("Bien introuvable.");
    error.status = 404;
    throw error;
  }
  return saveAssetFileForOwner(formData, actor, {
    type: "unit",
    id: assetUnit.id,
    code: assetUnit.assetCode,
    label: `au bien ${assetUnit.assetCode}`
  });
}

export async function saveAssetEntryFileFromForm(assetEntryId, formData, actor) {
  const assetEntry = await prisma.assetEntry.findUnique({
    where: { id: String(assetEntryId || "") },
    select: { id: true, entryNumber: true }
  });
  if (!assetEntry) {
    const error = new Error("Entrée introuvable.");
    error.status = 404;
    throw error;
  }
  return saveAssetFileForOwner(formData, actor, {
    type: "entry",
    id: assetEntry.id,
    code: assetEntry.entryNumber,
    label: `l’entrée ${assetEntry.entryNumber}`
  }, { requireFileKind: true });
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
  if (body.fileKind !== undefined) {
    if (!isAssetFileKind(body.fileKind)) throw new Error("Catégorie de fichier non acceptée.");
    data.fileKind = body.fileKind;
  }
  if (body.fileType !== undefined) {
    if (!isAssetFileType(body.fileType)) throw new Error("Type de fichier non accepte.");
    data.fileType = body.fileType;
  }
  if (body.fileLabel !== undefined) data.fileLabel = String(body.fileLabel || "").trim() || null;
  if (body.notes !== undefined) data.notes = String(body.notes || "").trim() || null;
  if (body.isPrimary !== undefined) {
    data.isPrimary = Boolean(body.isPrimary);
  }

  const effectiveFileKind = data.fileKind ?? current.fileKind ?? inferAssetFileKind(data.fileType ?? current.fileType, current.mimeType);
  assertFileSemantics({
    fileKind: effectiveFileKind,
    fileType: data.fileType ?? current.fileType,
    mimeType: current.mimeType,
    isPrimary: data.isPrimary ?? current.isPrimary
  });

  return prisma.$transaction(async (tx) => {
    await assertActiveDatabaseSchema(tx);
    if (data.isPrimary) {
      await tx.assetFile.updateMany({
        where: {
          ...(current.assetEntryId
            ? { assetEntryId: current.assetEntryId }
            : { assetUnitId: current.assetUnitId }),
          deletedAt: null,
          isPrimary: true,
          id: { not: id }
        },
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
        metadata: JSON.stringify(current.assetEntryId
          ? { assetEntryId: current.assetEntryId }
          : { assetUnitId: current.assetUnitId }),
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
    metadata: current.assetEntryId
      ? { assetEntryId: current.assetEntryId }
      : { assetUnitId: current.assetUnitId },
    userId: actor.id
  });
  return deleted;
}

export function assetFileOptions() {
  return {
    fileKinds: ASSET_FILE_KINDS,
    fileTypes: ASSET_FILE_TYPES,
    acceptedExtensions: ACCEPTED_ASSET_FILE_EXTENSIONS,
    maxFileSize: MAX_ASSET_FILE_SIZE
  };
}
