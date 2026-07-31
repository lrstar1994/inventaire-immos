import { authorizeApiRequest } from "@/lib/authorization-http";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { getRequestUser } from "@/lib/request-user";
import { canManageAssetDocuments } from "@/lib/roles";
import { auditDocument, documentInclude, generateDocumentNumber, parseDocumentDate } from "@/lib/document-service";
import { isDocumentTypeAllowedInLot4 } from "@/lib/document-constants";

export async function GET(request) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const { searchParams } = new URL(request.url);
  const where = {};
  if (searchParams.get("documentType")) where.documentType = searchParams.get("documentType");
  if (searchParams.get("status")) where.status = searchParams.get("status");

  const documents = await prisma.assetDocument.findMany({
    where,
    include: {
      entries: true,
      lines: true
    },
    orderBy: { documentDate: "desc" }
  });

  return jsonOk({ documents });
}

export async function POST(request) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssetDocuments(actor.role)) {
    return jsonError("Droits insuffisants pour creer un document.", 403);
  }

  const body = await readJson(request);
  const documentType = body.documentType || "ENTRY_SLIP";
  if (!isDocumentTypeAllowedInLot4(documentType)) {
    return jsonError("Type de document non exploite dans le Lot 4.");
  }

  const documentDate = parseDocumentDate(body.documentDate);
  const documentNumber = await generateDocumentNumber(prisma, documentType, documentDate);
  const document = await prisma.assetDocument.create({
    data: {
      documentNumber,
      documentType,
      documentDate,
      title: body.title || "Document chronologique",
      notes: body.notes || null,
      status: "DRAFT",
      createdById: actor.id,
      updatedById: actor.id
    },
    include: documentInclude()
  });

  await auditDocument("ASSET_DOCUMENT_CREATED", document, actor);
  return jsonOk({ document }, { status: 201 });
}
