import { jsonError, jsonOk, readJson } from "@/lib/api";
import { authorizeApiRequest } from "@/lib/authorization-http";
import { individualizeQuantitativeStock } from "@/lib/quantitative-individualization-service";
import { getRequestUser } from "@/lib/request-user";
import { canManageAssets } from "@/lib/roles";

export async function POST(request) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssets(actor.role)) return jsonError("Droits insuffisants pour individualiser ce stock.", 403);
  try {
    const result = await individualizeQuantitativeStock(await readJson(request), actor);
    return jsonOk(result, { status: 201 });
  } catch (error) {
    return jsonError(error.message || "Individualisation impossible.", error.status || 400, { code: error.code || "INDIVIDUALIZATION_FAILED" });
  }
}
