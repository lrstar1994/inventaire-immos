import { authorizeApiRequest } from "@/lib/authorization-http";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { createAssetEntryDraft } from "@/lib/asset-service";
import { getRequestUser } from "@/lib/request-user";
import { canManageAssets } from "@/lib/roles";

export async function POST(request) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssets(actor.role)) return jsonError("Droits insuffisants pour creer un brouillon d'entree.", 403);
  try {
    return jsonOk(await createAssetEntryDraft(await readJson(request), actor), { status: 201 });
  } catch (error) {
    return jsonError(error.code || error.message || "Creation du brouillon impossible.", error.status || 400, { message: error.message });
  }
}
