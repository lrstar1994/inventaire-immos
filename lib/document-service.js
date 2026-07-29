import { assertActiveDatabaseSchema, prisma } from "@/lib/prisma";
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
  const preparationStartedAt = performance.now();
  const entryIds = [...new Set(Array.isArray(body.entryIds) ? body.entryIds.filter(Boolean) : [])];
  const documentType = body.documentType || "ENTRY_SLIP";
  const documentDate = parseDocumentDate(body.documentDate);
  const requestedTitle = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
  const requestedNotes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  if (entryIds.length === 0) throw new Error("Au moins une entree est obligatoire.");
  if (!isDocumentTypeAllowedInLot4(documentType)) throw new Error("Type de document non exploite dans le Lot 4.");

  const preparationMs = Math.round(performance.now() - preparationStartedAt);
  const transactionCallStartedAt = performance.now();
  let transactionStartedAt;
  let guardMs = null;
  let readQueries = 0;
  let writeQueries = 0;

  let document;
  try {
    document = await prisma.$transaction(async (tx) => {
      transactionStartedAt = performance.now();
      const guardStartedAt = performance.now();
      await assertActiveDatabaseSchema(tx);
      guardMs = Math.round(performance.now() - guardStartedAt);
      readQueries += 1;

    readQueries += 1;
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
    readQueries += documentType === "ENTRY_SLIP" && unitIds.length > 0 ? 2 : 1;
    await assertNoActiveDocumentConflict(tx, { documentType, entryIds, unitIds });

    readQueries += 1;
    const documentNumber = await generateDocumentNumber(tx, documentType, documentDate);
    writeQueries += 1;
    const createdDocument = await tx.assetDocument.create({
      data: {
        documentNumber,
        documentType,
        documentDate,
        title: requestedTitle || titleFor(documentType, entries),
        status: "DRAFT",
        notes: requestedNotes,
        createdById: actor.id,
        updatedById: actor.id
      }
    });

    writeQueries += 1;
    await tx.assetDocumentEntry.createMany({
      data: entries.map((entry) => ({ documentId: createdDocument.id, assetEntryId: entry.id }))
    });

    const seenUnitIds = new Set();
    const lines = [];
    for (const entry of entries) {
      for (const unit of entry.assetUnits) {
        if (seenUnitIds.has(unit.id)) continue;
        seenUnitIds.add(unit.id);
        lines.push({
          documentId: createdDocument.id,
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
      writeQueries += 1;
      await tx.assetDocumentLine.createMany({ data: lines });
    }

    readQueries += 1;
    const completeDocument = await tx.assetDocument.findUnique({
      where: { id: createdDocument.id },
      include: documentInclude()
    });

    writeQueries += 1;
    await tx.auditLog.create({
      data: {
        action: "ASSET_DOCUMENT_FROM_ENTRIES_CREATED",
        entityTable: "asset_documents",
        entityId: completeDocument.id,
        summary: `ASSET_DOCUMENT_FROM_ENTRIES_CREATED ${completeDocument.documentNumber}`,
        metadata: JSON.stringify({
          entryCount: completeDocument.entries.length,
          lineCount: completeDocument.lines.length
        }),
        userId: actor?.id || null
      }
    });

      return completeDocument;
    }, {
      maxWait: 10000,
      timeout: 30000
    });
  } catch (error) {
    const failedAt = performance.now();
    console.info(JSON.stringify({
      event: "asset_document_from_entries_transaction",
      preparationMs,
      acquisitionMs: transactionStartedAt
        ? Math.round(transactionStartedAt - transactionCallStartedAt)
        : null,
      guardMs,
      transactionMs: transactionStartedAt ? Math.round(failedAt - transactionStartedAt) : null,
      transactionCallMs: Math.round(failedAt - transactionCallStartedAt),
      readQueries,
      writeQueries,
      totalQueries: readQueries + writeQueries,
      maxWaitMs: 10000,
      timeoutMs: 30000,
      result: "ROLLBACK",
      errorCode: error?.code || null
    }));
    throw error;
  }

  const transactionFinishedAt = performance.now();
  console.info(JSON.stringify({
    event: "asset_document_from_entries_transaction",
    preparationMs,
    acquisitionMs: Math.round(transactionStartedAt - transactionCallStartedAt),
    guardMs,
    transactionMs: Math.round(transactionFinishedAt - transactionStartedAt),
    transactionCallMs: Math.round(transactionFinishedAt - transactionCallStartedAt),
    readQueries,
    writeQueries,
    totalQueries: readQueries + writeQueries,
    maxWaitMs: 10000,
    timeoutMs: 30000,
    result: "COMMIT"
  }));
  return document;
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
