import { authorizeApiRequest } from "@/lib/authorization-http";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { assetFileOptions } from "@/lib/asset-file-service";
import { toAssetFileAccessDtos } from "@/lib/storage/asset-file-access-dto";

export async function GET(request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const { id } = await params;
  const unit = await prisma.assetUnit.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, assetCode: true }
  });
  if (!unit) return jsonError("Bien introuvable.", 404);

  const { searchParams } = new URL(request.url);
  const where = { assetUnitId: id };
  if (searchParams.get("includeDeleted") !== "true") where.deletedAt = null;

  const files = await prisma.assetFile.findMany({
    where,
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }]
  });

  return jsonOk({
    unit,
    files: await toAssetFileAccessDtos(files),
    options: assetFileOptions(),
  });
}
