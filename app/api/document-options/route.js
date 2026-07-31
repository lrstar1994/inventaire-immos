import { authorizeApiRequest } from "@/lib/authorization-http";
import { prisma } from "@/lib/prisma";
import { jsonOk } from "@/lib/api";
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from "@/lib/document-constants";
import { ENTRY_TYPES } from "@/lib/asset-constants";

export async function GET() {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const [entries, assetUnits, assetItems, locations, suppliers] = await Promise.all([
    prisma.assetEntry.findMany({
      include: {
        assetItem: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true, code: true } },
        assetUnits: { select: { id: true, assetCode: true } },
        documentEntries: {
          where: { document: { status: { in: ["DRAFT", "VALIDATED"] } } },
          include: { document: { select: { id: true, documentNumber: true, documentType: true, status: true } } }
        }
      },
      orderBy: { entryDate: "desc" }
    }),
    prisma.assetUnit.findMany({
      where: { deletedAt: null },
      include: {
        assetItem: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true, code: true } }
      },
      orderBy: { assetCode: "asc" }
    }),
    prisma.assetItem.findMany({ where: { status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: { status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" } })
  ]);

  return jsonOk({
    documentTypes: DOCUMENT_TYPES,
    activeDocumentTypes: DOCUMENT_TYPES.filter((type) => type.activeInLot4),
    documentStatuses: DOCUMENT_STATUSES,
    entryTypes: ENTRY_TYPES,
    entries,
    assetUnits,
    assetItems,
    locations,
    suppliers
  });
}
