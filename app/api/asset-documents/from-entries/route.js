import { authorizeApiRequest } from "@/lib/authorization-http";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { getRequestUser } from "@/lib/request-user";
import { canManageAssetDocuments } from "@/lib/roles";
import { createDocumentFromEntries } from "@/lib/document-service";

export async function POST(request) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssetDocuments(actor.role)) {
    return jsonError("Droits insuffisants pour creer un document depuis des entrees.", 403);
  }

  try {
    const body = await readJson(request);
    const document = await createDocumentFromEntries(body, actor);
    return jsonOk({ document }, { status: 201 });
  } catch (error) {
    const message = error.message || "Creation impossible.";
    const status = message.includes("document actif") || message.includes("bon d'entree actif") ? 409 : 400;
    return jsonError(message, status);
  }
}
