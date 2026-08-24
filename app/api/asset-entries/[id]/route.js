import { authorizeApiRequest } from "@/lib/authorization-http";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { computeAssetEntryProgress, updateAssetEntryDraft } from "@/lib/asset-service";
import { canManageAssets } from "@/lib/roles";
import { getRequestUser } from "@/lib/request-user";

const include = {
  assetItem: { select: { id: true, name: true, code: true } },
  location: { select: { id: true, name: true, code: true } },
  supplier: { select: { id: true, name: true, code: true } },
  assetUnits: { select: { id: true, assetCode: true, status: true, condition: true } },
  _count: { select: { assetFiles: { where: { deletedAt: null } } } }
};

export async function GET(_request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const { id } = await params;
  const entry = await prisma.assetEntry.findUnique({ where: { id }, include });
  if (!entry) return jsonError("Entree introuvable.", 404);
  return jsonOk({ entry, progress: computeAssetEntryProgress(entry) });
}

export async function PATCH(request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssets(actor.role)) {
    return jsonError("Droits insuffisants pour modifier une entree de parc.", 403);
  }

  const { id } = await params;
  try {
    return jsonOk(await updateAssetEntryDraft(id, await readJson(request), actor));
  } catch (error) {
    return jsonError(error.code || error.message || "Modification impossible.", error.status || 400, { message: error.message });
  }
}
