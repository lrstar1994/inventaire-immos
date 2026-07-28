import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { getRequestUser } from "@/lib/request-user";
import { canManageAssetDocuments } from "@/lib/roles";
import { auditDocument, documentInclude, logSensitiveAttempt } from "@/lib/document-service";

export async function POST(request, { params }) {
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssetDocuments(actor.role)) {
    return jsonError("Droits insuffisants pour annuler un document.", 403);
  }

  const { id } = await params;
  const body = await readJson(request);
  const reason = String(body.reason || "").trim();
  const current = await prisma.assetDocument.findUnique({ where: { id } });
  if (!current) return jsonError("Document introuvable.", 404);
  if (!reason) return jsonError("Motif obligatoire pour annuler un document.");

  if (current.status === "VALIDATED") {
    await logSensitiveAttempt({
      action: "VALIDATED_DOCUMENT_CANCEL",
      entityTable: "asset_documents",
      entityId: current.id,
      actor,
      reason,
      metadata: { documentNumber: current.documentNumber }
    });
    return jsonError("Annulation d'un document valide interdite en Lot 4 : validation Direction par code personnel requise, non encore active.", 423);
  }

  const document = await prisma.assetDocument.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById: actor.id,
      cancellationReason: reason,
      updatedById: actor.id
    },
    include: documentInclude()
  });

  await auditDocument("ASSET_DOCUMENT_CANCELLED", document, actor, { reason });
  return jsonOk({ document });
}
