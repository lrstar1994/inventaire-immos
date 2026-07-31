import { authorizeApiRequest } from "@/lib/authorization-http";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { assetFileInclude, assetFileOptions, saveAssetFileFromForm } from "@/lib/asset-file-service";
import { getRequestUser } from "@/lib/request-user";
import { canUploadAssetFiles } from "@/lib/roles";
import { toAssetFileAccessDtos } from "@/lib/storage/asset-file-access-dto";

export async function GET(request) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const { searchParams } = new URL(request.url);
  const where = {};
  if (searchParams.get("assetUnitId")) where.assetUnitId = searchParams.get("assetUnitId");
  if (searchParams.get("fileType")) where.fileType = searchParams.get("fileType");
  if (searchParams.get("includeDeleted") !== "true") where.deletedAt = null;

  const files = await prisma.assetFile.findMany({
    where,
    include: assetFileInclude(),
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }]
  });

  return jsonOk({
    files: await toAssetFileAccessDtos(files),
    options: assetFileOptions(),
  });
}

export async function POST(request) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canUploadAssetFiles(actor.role)) {
    return jsonError("Utilisateur non autorise.", 403);
  }

  try {
    const formData = await request.formData();
    const file = await saveAssetFileFromForm(formData, actor);
    return jsonOk({ file }, { status: 201 });
  } catch (error) {
    return jsonError(error.message || "Ajout du fichier impossible.", error.status || 400);
  }
}
