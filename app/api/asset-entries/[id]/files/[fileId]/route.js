import { authorizeApiRequest } from "@/lib/authorization-http";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { deleteAssetFile, updateAssetFile } from "@/lib/asset-file-service";
import { getRequestUser } from "@/lib/request-user";
import { canManageAssetFiles } from "@/lib/roles";
import { toAssetFileAccessDto } from "@/lib/storage/asset-file-access-dto";

async function ownedEntryFile(entryId, fileId) {
  return prisma.assetFile.findFirst({
    where: { id: fileId, assetEntryId: entryId, assetUnitId: null, deletedAt: null },
    select: { id: true }
  });
}

export async function PATCH(request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssetFiles(actor.role)) return jsonError("Utilisateur non autorise.", 403);

  try {
    const { id, fileId } = await params;
    if (!await ownedEntryFile(id, fileId)) return jsonError("Fichier d’entrée introuvable.", 404);
    const file = await updateAssetFile(fileId, await readJson(request), actor);
    return jsonOk({ file: await toAssetFileAccessDto(file) });
  } catch (error) {
    return jsonError(error.message || "Modification impossible.", error.status || 400);
  }
}

export async function DELETE(request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssetFiles(actor.role)) return jsonError("Utilisateur non autorise.", 403);

  try {
    const { id, fileId } = await params;
    if (!await ownedEntryFile(id, fileId)) return jsonError("Fichier d’entrée introuvable.", 404);
    const file = await deleteAssetFile(fileId, actor);
    return jsonOk({ file: await toAssetFileAccessDto(file) });
  } catch (error) {
    return jsonError(error.message || "Suppression impossible.", error.status || 400);
  }
}
