import { authorizeApiRequest } from "@/lib/authorization-http";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import {
  assetFileOptions,
  saveAssetEntryFileFromForm
} from "@/lib/asset-file-service";
import { getRequestUser } from "@/lib/request-user";
import { canUploadAssetFiles } from "@/lib/roles";
import { toAssetFileAccessDto, toAssetFileAccessDtos } from "@/lib/storage/asset-file-access-dto";

export async function GET(_request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const { id } = await params;
  const entry = await prisma.assetEntry.findUnique({
    where: { id },
    select: { id: true, entryNumber: true, quantity: true }
  });
  if (!entry) return jsonError("Entrée introuvable.", 404);

  const files = await prisma.assetFile.findMany({
    where: { assetEntryId: id, deletedAt: null },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }]
  });
  return jsonOk({
    entry,
    files: await toAssetFileAccessDtos(files),
    options: assetFileOptions()
  });
}

export async function POST(request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canUploadAssetFiles(actor.role)) {
    return jsonError("Utilisateur non autorise.", 403);
  }

  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = await saveAssetEntryFileFromForm(id, formData, actor);
    return jsonOk({ file: await toAssetFileAccessDto(file) }, { status: 201 });
  } catch (error) {
    return jsonError(error.message || "Ajout du fichier impossible.", error.status || 400);
  }
}
