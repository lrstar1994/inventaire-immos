import { authorizeApiRequest } from "@/lib/authorization-http";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { validateAssetEntryDraft } from "@/lib/asset-service";
import { getRequestUser } from "@/lib/request-user";
import { canManageAssets } from "@/lib/roles";

export async function POST(request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssets(actor.role)) return jsonError("Droits insuffisants pour valider une entree.", 403);
  try {
    const { id } = await params;
    return jsonOk(await validateAssetEntryDraft(id, actor, await readJson(request)));
  } catch (error) {
    return jsonError(error.code || error.message || "Validation impossible.", error.status || 400, { message: error.message });
  }
}
