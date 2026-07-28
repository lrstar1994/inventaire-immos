import { prisma } from "@/lib/prisma";
import { DOCUMENT_TYPES, isDocumentTypeAllowedInLot4 } from "@/lib/document-constants";
import { writeAuditLog } from "@/lib/audit";

function yearFrom(date = new Date()) {
  return new Date(date).getFullYear();
}

function extractSequence(code, prefix) {
  const match = String(code).match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d{6})$`));
  return match ? Number.parseInt(match[1], 10) : 0;
}

export function parseDocumentDate(value) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export async function generateDocumentNumber(tx, documentType, date = new Date()) {
  const prefix = documentType === "ENTRY_SLIP" ? `BE-${yearFrom(date)}` : `DOC-${yearFrom(date)}`;
  const existing = await tx.assetDocument.findMany({
    where: { documentNumber: { startsWith: `${prefix}-` } },
    select: { documentNumber: true }
  });
  const max = existing.reduce((current, item) => Math.max(current, extractSequence(item.documentNumber, prefix)), 0);
  return `${prefix}-${String(max + 1).padStart(6, "0")}`;
}

function titleFor(documentType, entries) {
  const label = DOCUMENT_TYPES.find((item) => item.code === documentType)?.label || "Document";
  return `${label} - ${entries.length} entree(s)`;
}

function formatConflictList(values) {
  return [...new Set(values.filter(Boolean))].join(", ");
}

export async function assertNoActiveDocumentConflict(tx, { documentType, entryIds = [], unitIds = [], excludeDocumentId = null }) {
  const activeDocumentFilter = {
    documentType,
    status: { in: ["DRAFT", "VALIDATED"] },
    ...(excludeDocumentId ? { id: { not: excludeDocumentId } } : {})
  };

  const entryConflicts = entryIds.length
    ? await tx.assetDocumentEntry.findMany({
        where: {
          assetEntryId: { in: entryIds },
          document: activeDocumentFilter
        },
        include: {
          assetEntry: { select: { entryNumber: true } },
          document: { select: { documentNumber: true } }
        }
      })
    : [];

  if (entryConflicts.length > 0) {
    const documentLabel = documentType === "ENTRY_SLIP" ? "bon d'entree actif" : "document actif du meme type";
    throw new Error(
      `Cette entree est deja rattachee a un ${documentLabel}. Impossible de creer un autre document avec la meme entree : ${formatConflictList(
        entryConflicts.map((item) => `${item.assetEntry.entryNumber} (${item.document.documentNumber})`)
      )}.`
    );
  }

  if (documentType !== "ENTRY_SLIP" || unitIds.length === 0) return;

  const unitConflicts = await tx.assetDocumentLine.findMany({
    where: {
      assetUnitId: { in: unitIds },
      document: activeDocumentFilter
    },
    include: {
      assetUnit: { select: { assetCode: true } },
      document: { select: { documentNumber: true } }
    }
  });

  if (unitConflicts.length > 0) {
    throw new Error(
      `Bien physique deja present dans un bon d'entree actif : ${formatConflictList(
        unitConflicts.map((item) => `${item.assetUnit?.assetCode || item.assetUnitId} (${item.document.documentNumber})`)
      )}.`
    );
  }
}

export async function createDocumentFromEntries(body, actor) {
  return prisma.$transaction(async (tx) => {
    const entryIds = [...new Set(Array.isArray(body.entryIds) ? body.entryIds.filter(Boolean) : [])];
    const documentType = body.documentType || "ENTRY_SLIP";
    const documentDate = parseDocumentDate(body.documentDate);

    if (entryIds.length === 0) throw new Error("Au moins une entree est obligatoire.");
    if (!isDocumentTypeAllowedInLot4(documentType)) throw new Error("Type de document non exploite dans le Lot 4.");

    const entries = await tx.assetEntry.findMany({
      where: { id: { in: entryIds } },
      include: {
        assetItem: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true, code: true } },
        assetUnits: {
          where: { deletedAt: null },
          include: {
            assetItem: { select: { id: true, name: true, code: true } },
            location: { select: { id: true, name: true, code: true } }
          }
        }
      }
    });

    if (entries.length !== entryIds.length) throw new Error("Une ou plusieurs entrees sont introuvables.");

    const unitIds = entries.flatMap((entry) => entry.assetUnits.map((unit) => unit.id));
    await assertNoActiveDocumentConflict(tx, { documentType, entryIds, unitIds });

    const documentNumber = await generateDocumentNumber(tx, documentType, documentDate);
    const document = await tx.assetDocument.create({
      data: {
        documentNumber,
        documentType,
        documentDate,
        title: body.title || titleFor(documentType, entries),
        status: "DRAFT",
        notes: body.notes || null,
        createdById: actor.id,
        updatedById: actor.id
      }
    });

    await tx.assetDocumentEntry.createMany({
      data: entries.map((entry) => ({ documentId: document.id, assetEntryId: entry.id }))
    });

    const seenUnitIds = new Set();
    const lines = [];
    for (const entry of entries) {
      for (const unit of entry.assetUnits) {
        if (seenUnitIds.has(unit.id)) continue;
        seenUnitIds.add(unit.id);
        lines.push({
          documentId: document.id,
          assetEntryId: entry.id,
          assetUnitId: unit.id,
          assetItemId: unit.assetItemId,
          locationId: unit.locationId,
          quantity: 1,
          lineLabel: `${unit.assetCode} - ${unit.assetItem?.name || entry.assetItem?.name || "Bien"}`,
          lineNotes: entry.entryNumber
        });
      }
    }

    if (lines.length > 0) {
      await tx.assetDocumentLine.createMany({ data: lines });
    }

    return tx.assetDocument.findUnique({
      where: { id: document.id },
      include: documentInclude()
    });
  });
}

export function documentInclude() {
  return {
    entries: {
      include: {
        assetEntry: {
          include: {
            assetItem: { select: { id: true, name: true, code: true } },
            location: { select: { id: true, name: true, code: true } },
            supplier: { select: { id: true, name: true, code: true } }
          }
        }
      }
    },
    lines: {
      include: {
        assetEntry: { select: { id: true, entryNumber: true } },
        assetUnit: { select: { id: true, assetCode: true, status: true, condition: true } },
        assetItem: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true, code: true } }
      },
      orderBy: { createdAt: "asc" }
    }
  };
}

export async function auditDocument(action, document, actor, metadata = {}) {
  return writeAuditLog({
    action,
    entityTable: "asset_documents",
    entityId: document.id,
    summary: `${action} ${document.documentNumber}`,
    metadata,
    userId: actor?.id || null
  });
}

export async function logSensitiveAttempt({ action, entityTable, entityId, actor, reason, metadata }) {
  const approval = await prisma.sensitiveActionApproval.create({
    data: {
      action,
      entityTable,
      entityId,
      requestedBy: actor?.id || null,
      approvedBy: null,
      approvedAt: null,
      reason,
      metadata: JSON.stringify({
        status: "BLOCKED_PENDING_DIRECTION_CODE",
        ...metadata
      })
    }
  });

  return writeAuditLog({
    action: "SENSITIVE_ACTION_BLOCKED_PENDING_DIRECTION_CODE",
    entityTable,
    entityId,
    summary: `Action sensible bloquee: ${action}`,
    metadata: {
      sensitiveActionApprovalId: approval.id,
      requestedBy: actor?.id || null,
      reason,
      requiredFutureApproval: "direction_code",
      ...metadata
    },
    userId: actor?.id || null
  });
}
