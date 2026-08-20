import { generateAssetCodes } from "@/lib/asset-codes";
import { assertActiveDatabaseSchema, prisma } from "@/lib/prisma";

function businessError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function strictPositiveInteger(value) {
  if (!/^[1-9]\d*$/.test(String(value ?? "").trim())) {
    throw businessError("La quantité doit être un entier strictement positif.", "INVALID_QUANTITY");
  }
  return Number(value);
}

export async function individualizeQuantitativeStock(body, actor, { prismaClient = prisma, beforeUnitsCreate = null } = {}) {
  const assetEntryId = String(body.assetEntryId || "").trim();
  const locationId = String(body.locationId || "").trim();
  const quantity = strictPositiveInteger(body.quantity);
  if (!assetEntryId || !locationId) throw businessError("Lot et emplacement sont obligatoires.", "MISSING_INDIVIDUALIZATION_REFERENCE");

  return prismaClient.$transaction(async (tx) => {
    await assertActiveDatabaseSchema(tx);
    const [entry, location, position] = await Promise.all([
      tx.assetEntry.findUnique({
        where: { id: assetEntryId },
        include: {
          assetItem: {
            select: {
              id: true, code: true, status: true, deletedAt: true,
              category: { select: { hierarchyLevel: true, trackingMode: true, status: true, deletedAt: true } }
            }
          }
        }
      }),
      tx.location.findFirst({ where: { id: locationId, status: "ACTIVE", deletedAt: null } }),
      tx.quantitativeStockPosition.findUnique({ where: { assetEntryId_locationId: { assetEntryId, locationId } } })
    ]);

    const family = entry?.assetItem?.category;
    if (!entry || entry.assetItem?.status !== "ACTIVE" || entry.assetItem?.deletedAt || !family || family.hierarchyLevel !== "FAMILY" || family.status !== "ACTIVE" || family.deletedAt) {
      throw businessError("Lot QI ou famille active introuvable.", "INVALID_QI_ENTRY", 404);
    }
    if (family.trackingMode !== "QI") {
      throw businessError("TRACKING_MODE_NOT_OPERATIONAL", "TRACKING_MODE_NOT_OPERATIONAL", 409);
    }
    if (!location) throw businessError("Emplacement actif introuvable.", "INACTIVE_LOCATION", 404);
    if (!position) throw businessError("Position quantitative introuvable.", "POSITION_NOT_FOUND", 404);

    const codes = await generateAssetCodes(tx, entry.assetItem, quantity, entry.entryDate);
    const decremented = await tx.quantitativeStockPosition.updateMany({
      where: { id: position.id, availableQuantity: { gte: quantity } },
      data: { availableQuantity: { decrement: quantity }, updatedById: actor.id }
    });
    if (decremented.count !== 1) {
      throw businessError("Stock insuffisant ou déjà individualisé par une opération concurrente.", "INSUFFICIENT_STOCK", 409);
    }

    const unitsData = codes.map((assetCode) => ({
      assetCode,
      assetItemId: entry.assetItemId,
      locationId,
      supplierId: entry.supplierId,
      entryId: entry.id,
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
      possibleDuplicate: false,
      notes: entry.notes,
      createdById: actor.id,
      updatedById: actor.id
    }));
    if (beforeUnitsCreate) await beforeUnitsCreate(tx, unitsData);
    await tx.assetUnit.createMany({ data: unitsData });
    const units = await tx.assetUnit.findMany({ where: { assetCode: { in: codes } }, orderBy: { assetCode: "asc" } });

    await tx.auditLog.createMany({
      data: [
        {
          action: "QUANTITATIVE_STOCK_INDIVIDUALIZED", entityTable: "quantitative_stock_positions", entityId: position.id,
          summary: `Individualisation de ${quantity} unité(s) depuis ${entry.entryNumber}`,
          metadata: JSON.stringify({ assetEntryId, locationId, quantity, assetCodes: codes }), userId: actor.id
        },
        ...units.map((unit) => ({
          action: "ASSET_UNIT_CREATED_BY_INDIVIDUALIZATION", entityTable: "asset_units", entityId: unit.id,
          summary: `Unité ${unit.assetCode} individualisée depuis ${entry.entryNumber}`,
          metadata: JSON.stringify({ assetEntryId, sourcePositionId: position.id }), userId: actor.id
        }))
      ]
    });
    return { units, individualizedQuantity: quantity, assetEntryId, locationId };
  }, { maxWait: 10000, timeout: 30000 });
}
