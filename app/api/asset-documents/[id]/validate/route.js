import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { getRequestUser } from "@/lib/request-user";
import { canManageAssetDocuments } from "@/lib/roles";
import { assertNoActiveDocumentConflict, auditDocument, documentInclude } from "@/lib/document-service";

export async function POST(request, { params }) {
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssetDocuments(actor.role)) {
    return jsonError("Droits insuffisants pour valider un document.", 403);
  }

  const { id } = await params;
  const current = await prisma.assetDocument.findUnique({ where: { id } });
  if (!current) return jsonError("Document introuvable.", 404);
  if (current.status === "CANCELLED") return jsonError("Document annule non validable.", 400);
  if (current.status === "VALIDATED") return jsonOk({ document: await prisma.assetDocument.findUnique({ where: { id }, include: documentInclude() }) });

  try {
    await prisma.$transaction(async (tx) => {
      const documentToValidate = await tx.assetDocument.findUnique({
        where: { id },
        include: {
          entries: { select: { assetEntryId: true } },
          lines: { select: { assetUnitId: true } }
        }
      });

      await assertNoActiveDocumentConflict(tx, {
        documentType: documentToValidate.documentType,
        entryIds: documentToValidate.entries.map((entry) => entry.assetEntryId),
        unitIds: documentToValidate.lines.map((line) => line.assetUnitId).filter(Boolean),
        excludeDocumentId: documentToValidate.id
      });
    });
  } catch (error) {
    return jsonError(error.message || "Validation impossible.", 409);
  }

  const document = await prisma.assetDocument.update({
    where: { id },
    data: {
      status: "VALIDATED",
      validatedById: actor.id,
      validatedAt: new Date(),
      updatedById: actor.id
    },
    include: documentInclude()
  });

  await auditDocument("ASSET_DOCUMENT_VALIDATED", document, actor);
  return jsonOk({ document });
}
