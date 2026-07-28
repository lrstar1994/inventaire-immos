import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ENTRY_TYPES } from "@/lib/asset-constants";
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from "@/lib/document-constants";
import DocumentManager from "./document-manager";

export const dynamic = "force-dynamic";

async function loadDocumentData() {
  const [entries, assetUnits, assetItems, locations, suppliers, documents] = await Promise.all([
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
    prisma.supplier.findMany({ where: { status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.assetDocument.findMany({
      include: { entries: true, lines: true },
      orderBy: { documentDate: "desc" }
    })
  ]);

  return JSON.parse(JSON.stringify({
    options: {
      documentTypes: DOCUMENT_TYPES,
      activeDocumentTypes: DOCUMENT_TYPES.filter((type) => type.activeInLot4),
      documentStatuses: DOCUMENT_STATUSES,
      entryTypes: ENTRY_TYPES,
      entries,
      assetUnits,
      assetItems,
      locations,
      suppliers
    },
    documents
  }));
}

export default async function DocumentsPage() {
  const initialData = await loadDocumentData();

  return (
    <main className="shell">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Documents</p>
          <h1>Documents chronologiques</h1>
          <p className="summary">
            Creez des brouillons a partir des entrees disponibles, puis validez les documents pour figer leur tracabilite.
          </p>
        </div>
        <Link className="button secondary" href="/">
          Retour accueil
        </Link>
      </section>
      <DocumentManager initialOptions={initialData.options} initialDocuments={initialData.documents} />
    </main>
  );
}
