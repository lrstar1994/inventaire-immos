import { prisma } from "@/lib/prisma";
import { generateAssetCodes, generateEntryNumber } from "@/lib/asset-codes";
import {
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  ENTRY_STATUSES,
  ENTRY_TYPES,
  INFORMATION_STATUSES,
  isAllowed
} from "@/lib/asset-constants";
import { writeAuditLog } from "@/lib/audit";

export function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseIntOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizePriceFields({ quantity, unitPrice, totalPrice, priceKnown }) {
  const normalizedQuantity = Math.max(Number.parseInt(quantity, 10) || 1, 1);
  let normalizedUnitPrice = parseIntOrNull(unitPrice);
  let normalizedTotalPrice = parseIntOrNull(totalPrice);
  const known = priceKnown === true || priceKnown === "true" || normalizedUnitPrice !== null || normalizedTotalPrice !== null;

  if (!known) {
    return { unitPrice: null, totalPrice: null, priceKnown: false };
  }

  if (normalizedUnitPrice !== null && normalizedTotalPrice === null) {
    normalizedTotalPrice = normalizedUnitPrice * normalizedQuantity;
  }
  if (normalizedTotalPrice !== null && normalizedUnitPrice === null) {
    normalizedUnitPrice = Math.floor(normalizedTotalPrice / normalizedQuantity);
  }

  return {
    unitPrice: normalizedUnitPrice,
    totalPrice: normalizedTotalPrice,
    priceKnown: normalizedUnitPrice !== null || normalizedTotalPrice !== null
  };
}

export function validateEntryPayload(body) {
  const errors = [];
  const quantity = Number.parseInt(body.quantity, 10);

  if (!body.assetItemId) errors.push("assetItemId est obligatoire.");
  if (!body.locationId) errors.push("locationId est obligatoire.");
  if (!Number.isFinite(quantity) || quantity < 1) errors.push("quantity doit etre superieur ou egal a 1.");
  if (!body.entryType || !isAllowed(body.entryType, ENTRY_TYPES)) errors.push("entryType est invalide.");
  if (!body.entryDate || !parseDate(body.entryDate)) errors.push("entryDate est obligatoire.");
  if (!body.initialCondition || !isAllowed(body.initialCondition, ASSET_CONDITIONS)) errors.push("initialCondition est invalide.");
  if (!body.initialStatus || !isAllowed(body.initialStatus, ASSET_STATUSES)) errors.push("initialStatus est invalide.");
  if (body.entryStatus && !isAllowed(body.entryStatus, ENTRY_STATUSES)) errors.push("entryStatus est invalide.");
  if (body.informationStatus && !isAllowed(body.informationStatus, INFORMATION_STATUSES)) {
    errors.push("informationStatus est invalide.");
  }

  return errors;
}

export async function validateActiveReferentials(tx, { assetItemId, locationId, supplierId }) {
  const [assetItem, location, supplier] = await Promise.all([
    tx.assetItem.findFirst({ where: { id: assetItemId, status: "ACTIVE", deletedAt: null } }),
    tx.location.findFirst({ where: { id: locationId, status: "ACTIVE", deletedAt: null } }),
    supplierId ? tx.supplier.findFirst({ where: { id: supplierId, status: "ACTIVE", deletedAt: null } }) : null
  ]);

  if (!assetItem) throw new Error("Article / modele actif introuvable.");
  if (!location) throw new Error("Emplacement actif introuvable.");
  if (supplierId && !supplier) throw new Error("Fournisseur actif introuvable.");

  return { assetItem, location, supplier };
}

export async function findPotentialAssetDuplicates(tx, { assetItemId, locationId, supplierId, serialNumber }) {
  const activeWhere = {
    deletedAt: null,
    status: { not: "RETIRED" }
  };
  const normalizedSerial = String(serialNumber || "").trim();

  const serialDuplicates = normalizedSerial
    ? await tx.assetUnit.findMany({
        where: { ...activeWhere, serialNumber: normalizedSerial },
        include: {
          assetItem: { select: { id: true, name: true, code: true } },
          location: { select: { id: true, name: true, code: true } },
          supplier: { select: { id: true, name: true, code: true } }
        },
        orderBy: { assetCode: "asc" }
      })
    : [];

  const similarUnits = await tx.assetUnit.findMany({
    where: {
      ...activeWhere,
      assetItemId,
      locationId,
      ...(supplierId ? { OR: [{ supplierId }, { supplierId: null }] } : {})
    },
    include: {
      assetItem: { select: { id: true, name: true, code: true } },
      location: { select: { id: true, name: true, code: true } },
      supplier: { select: { id: true, name: true, code: true } }
    },
    orderBy: { assetCode: "asc" }
  });

  return { serialDuplicates, similarUnits };
}

export function summarizeDuplicateUnit(unit) {
  return {
    id: unit.id,
    assetCode: unit.assetCode,
    serialNumber: unit.serialNumber,
    status: unit.status,
    condition: unit.condition,
    assetItem: unit.assetItem,
    location: unit.location,
    supplier: unit.supplier
  };
}

export async function createUnitsForValidatedEntry(tx, entry, actorId, { serialNumber = null, possibleDuplicate = false } = {}) {
  if (entry.entryStatus !== "VALIDATED") return [];

  const existingCount = await tx.assetUnit.count({ where: { entryId: entry.id } });
  if (existingCount > 0) {
    return tx.assetUnit.findMany({ where: { entryId: entry.id }, orderBy: { assetCode: "asc" } });
  }

  const assetItem = await tx.assetItem.findUnique({ where: { id: entry.assetItemId } });
  const codes = await generateAssetCodes(tx, assetItem, entry.quantity, entry.entryDate);

  const data = codes.map((assetCode) => ({
    assetCode,
    assetItemId: entry.assetItemId,
    locationId: entry.locationId,
    supplierId: entry.supplierId,
    entryId: entry.id,
    serialNumber,
    condition: entry.initialCondition,
    status: entry.initialStatus,
    informationStatus: entry.informationStatus,
    purchaseDate: entry.purchaseDate,
    purchaseDateKnown: entry.purchaseDateKnown,
    unitPrice: entry.unitPrice,
    priceKnown: entry.priceKnown,
    supplierKnown: entry.supplierKnown,
    invoiceAvailable: entry.invoiceAvailable,
    invoiceReference: entry.invoiceReference,
    possibleDuplicate,
    notes: entry.notes,
    createdById: actorId,
    updatedById: actorId
  }));

  await tx.assetUnit.createMany({ data });
  return tx.assetUnit.findMany({ where: { entryId: entry.id }, orderBy: { assetCode: "asc" } });
}

export async function createAssetEntryWithUnits(body, actor) {
  return prisma.$transaction(async (tx) => {
    const errors = validateEntryPayload(body);
    if (errors.length > 0) {
      throw new Error(errors.join(" "));
    }

    const quantity = Number.parseInt(body.quantity, 10);
    const supplierId = body.supplierKnown === false || body.supplierKnown === "false" ? null : body.supplierId || null;
    await validateActiveReferentials(tx, {
      assetItemId: body.assetItemId,
      locationId: body.locationId,
      supplierId
    });

    const prices = normalizePriceFields({
      quantity,
      unitPrice: body.unitPrice,
      totalPrice: body.totalPrice,
      priceKnown: body.priceKnown
    });
    const entryDate = parseDate(body.entryDate);
    const entryNumber = await generateEntryNumber(tx, entryDate);
    const purchaseDateKnown = body.purchaseDateKnown === true || body.purchaseDateKnown === "true";
    const purchaseDate = purchaseDateKnown ? parseDate(body.purchaseDate) : null;
    const supplierKnown = body.supplierKnown === true || body.supplierKnown === "true" || Boolean(supplierId);
    const invoiceAvailable = body.invoiceAvailable === true || body.invoiceAvailable === "true";
    const serialNumber = String(body.serialNumber || "").trim() || null;
    const duplicateConfirmed = body.duplicateConfirmed === true || body.duplicateConfirmed === "true";
    const duplicateReason = String(body.duplicateReason || "").trim();
    const duplicateCheck = await findPotentialAssetDuplicates(tx, {
      assetItemId: body.assetItemId,
      locationId: body.locationId,
      supplierId,
      serialNumber
    });

    if (duplicateCheck.serialDuplicates.length > 0) {
      throw new Error(
        `Numero de serie deja utilise par un bien actif : ${duplicateCheck.serialDuplicates
          .map((unit) => unit.assetCode)
          .join(", ")}.`
      );
    }

    const hasPossibleDuplicates = duplicateCheck.similarUnits.length > 0;
    if (hasPossibleDuplicates && (!duplicateConfirmed || !duplicateReason)) {
      const error = new Error("Doublon probable detecte : confirmation explicite et motif obligatoires.");
      error.code = "POSSIBLE_DUPLICATE";
      error.similarUnits = duplicateCheck.similarUnits.map(summarizeDuplicateUnit);
      throw error;
    }

    const entry = await tx.assetEntry.create({
      data: {
        entryNumber,
        assetItemId: body.assetItemId,
        locationId: body.locationId,
        supplierId,
        quantity,
        entryType: body.entryType,
        entryDate,
        initialCondition: body.initialCondition,
        initialStatus: body.initialStatus,
        entryStatus: body.entryStatus || "VALIDATED",
        informationStatus: body.informationStatus || "PARTIAL",
        purchaseDate,
        purchaseDateKnown,
        supplierKnown,
        unitPrice: prices.unitPrice,
        totalPrice: prices.totalPrice,
        priceKnown: prices.priceKnown,
        invoiceAvailable,
        invoiceReference: invoiceAvailable ? body.invoiceReference || null : null,
        notes: body.notes || null,
        createdById: actor.id,
        updatedById: actor.id
      }
    });

    const units = await createUnitsForValidatedEntry(tx, entry, actor.id, {
      serialNumber: quantity === 1 ? serialNumber : null,
      possibleDuplicate: hasPossibleDuplicates
    });
    return {
      entry,
      units,
      duplicateWarning: hasPossibleDuplicates
        ? {
            confirmed: true,
            reason: duplicateReason,
            similarUnits: duplicateCheck.similarUnits.map(summarizeDuplicateUnit)
          }
        : null
    };
  });
}

export async function auditEntryCreation({ entry, units, actor, duplicateWarning }) {
  await writeAuditLog({
    action: "ASSET_ENTRY_CREATED",
    entityTable: "asset_entries",
    entityId: entry.id,
    summary: `Creation de l'entree ${entry.entryNumber}`,
    metadata: { quantity: entry.quantity, entryStatus: entry.entryStatus },
    userId: actor.id
  });

  if (entry.entryStatus === "VALIDATED") {
    await writeAuditLog({
      action: units.length > 1 ? "ASSET_UNITS_BATCH_CREATED" : "ASSET_UNIT_CREATED",
      entityTable: "asset_entries",
      entityId: entry.id,
      summary: `Creation de ${units.length} bien(s) depuis ${entry.entryNumber}`,
      metadata: { assetCodes: units.map((unit) => unit.assetCode) },
      userId: actor.id
    });
  }

  if (entry.entryStatus === "VALIDATED" && duplicateWarning) {
    await writeAuditLog({
      action: "ASSET_UNIT_CREATED_WITH_DUPLICATE_WARNING",
      entityTable: "asset_entries",
      entityId: entry.id,
      summary: `Creation maintenue malgre alerte doublon probable pour ${entry.entryNumber}`,
      metadata: {
        reason: duplicateWarning.reason,
        similarAssetCodes: duplicateWarning.similarUnits.map((unit) => unit.assetCode)
      },
      userId: actor.id
    });
  }
}
