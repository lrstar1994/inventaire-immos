import { authorizeApiRequest } from "@/lib/authorization-http";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { assetFileInclude, deleteAssetFile, updateAssetFile } from "@/lib/asset-file-service";
import { getRequestUser } from "@/lib/request-user";
import { canManageAssetFiles } from "@/lib/roles";
import { toAssetFileAccessDto } from "@/lib/storage/asset-file-access-dto";

export async function GET(_request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const { id } = await params;
  const file = await prisma.assetFile.findUnique({
    where: { id },
    include: assetFileInclude()
  });
  if (!file || file.deletedAt) return jsonError("Fichier introuvable.", 404);
  return jsonOk({ file: await toAssetFileAccessDto(file) });
}

export async function PATCH(request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssetFiles(actor.role)) return jsonError("Utilisateur non autorise.", 403);

  try {
    const { id } = await params;
    const body = await readJson(request);
    const file = await updateAssetFile(id, body, actor);
    return jsonOk({ file });
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
    const { id } = await params;
    const file = await deleteAssetFile(id, actor);
    return jsonOk({ file });
  } catch (error) {
    return jsonError(error.message || "Suppression impossible.", error.status || 400);
  }
}
