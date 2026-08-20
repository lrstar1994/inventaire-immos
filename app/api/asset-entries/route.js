import { authorizeApiRequest } from "@/lib/authorization-http";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { canManageAssets } from "@/lib/roles";
import { getRequestUser } from "@/lib/request-user";
import { auditEntryCreation, createAssetEntryByTrackingMode } from "@/lib/asset-service";

const include = {
  assetItem: { select: { id: true, name: true, code: true } },
  location: { select: { id: true, name: true, code: true } },
  supplier: { select: { id: true, name: true, code: true } },
  assetUnits: { select: { id: true, assetCode: true, status: true, condition: true } }
};

export async function GET(request) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const { searchParams } = new URL(request.url);
  const where = {};

  if (searchParams.get("entryStatus")) where.entryStatus = searchParams.get("entryStatus");
  if (searchParams.get("assetItemId")) where.assetItemId = searchParams.get("assetItemId");

  const entries = await prisma.assetEntry.findMany({
    where,
    include,
    orderBy: { entryDate: "desc" }
  });

  return jsonOk({ entries });
}

export async function POST(request) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssets(actor.role)) {
    return jsonError("Droits insuffisants pour creer une entree de parc.", 403);
  }

  try {
    const body = await readJson(request);
    const result = await createAssetEntryByTrackingMode(body, actor);
    await auditEntryCreation({ ...result, actor });
    return jsonOk(result, { status: 201 });
  } catch (error) {
    if (error.code === "POSSIBLE_DUPLICATE") {
      return jsonError(error.message, 409, { similarUnits: error.similarUnits });
    }
    return jsonError(error.message || "Creation impossible.", error.status || 400);
  }
}
