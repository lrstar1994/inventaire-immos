import { jsonError, jsonOk, readJson } from "@/lib/api";
import { authorizeApiRequest } from "@/lib/authorization-http";
import { transferQuantitativeStock } from "@/lib/quantitative-transfer-service";
import { getRequestUser } from "@/lib/request-user";
import { canCreateMovementDraft } from "@/lib/roles";

export async function POST(request) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canCreateMovementDraft(actor.role)) {
    return jsonError("Droits insuffisants pour transférer un stock.", 403);
  }
  try {
    const result = await transferQuantitativeStock(await readJson(request), actor);
    return jsonOk(result, { status: 201 });
  } catch (error) {
    return jsonError(error.message || "Transfert impossible.", error.status || 400, { code: error.code || "QUANTITATIVE_TRANSFER_FAILED" });
  }
}
