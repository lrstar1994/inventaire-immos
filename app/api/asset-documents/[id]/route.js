import { authorizeApiRequest } from "@/lib/authorization-http";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { getRequestUser } from "@/lib/request-user";
import { canManageAssetDocuments } from "@/lib/roles";
import { auditDocument, documentInclude, parseDocumentDate } from "@/lib/document-service";

export async function GET(_request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const { id } = await params;
  const document = await prisma.assetDocument.findUnique({ where: { id }, include: documentInclude() });
  if (!document) return jsonError("Document introuvable.", 404);
  return jsonOk({ document });
}

export async function PATCH(request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssetDocuments(actor.role)) {
    return jsonError("Droits insuffisants pour modifier un document.", 403);
  }

  const { id } = await params;
  const current = await prisma.assetDocument.findUnique({ where: { id } });
  if (!current) return jsonError("Document introuvable.", 404);
  if (current.status === "VALIDATED") {
    await auditDocument("VALIDATED_DOCUMENT_UPDATE_BLOCKED", current, actor, { reason: "Document valide verrouille" });
    return jsonError("Document valide verrouille. Correction sensible reservee a un futur lot avec code Direction.", 423);
  }

  const body = await readJson(request);
  const document = await prisma.assetDocument.update({
    where: { id },
    data: {
      title: body.title ?? current.title,
      notes: body.notes !== undefined ? body.notes || null : current.notes,
      documentDate: body.documentDate ? parseDocumentDate(body.documentDate) : current.documentDate,
      updatedById: actor.id
    },
    include: documentInclude()
  });

  await auditDocument("ASSET_DOCUMENT_UPDATED", document, actor);
  return jsonOk({ document });
}
