import { assertActiveDatabaseSchema, prisma } from "@/lib/prisma";
import { generateMovementNumber, parseMovementDate } from "@/lib/movement-service";

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

export async function transferQuantitativeStock(body, actor, { prismaClient = prisma, beforeMovementCreate = null } = {}) {
  const assetEntryId = String(body.assetEntryId || "").trim();
  const fromLocationId = String(body.fromLocationId || "").trim();
  const toLocationId = String(body.toLocationId || "").trim();
  const quantity = strictPositiveInteger(body.quantity);
  const reason = String(body.reason || "").trim() || "Transfert interne quantitatif";
  const notes = String(body.notes || "").trim() || null;
  const movementDate = parseMovementDate(body.movementDate);

  if (!assetEntryId || !fromLocationId || !toLocationId) {
    throw businessError("Lot, emplacement source et destination sont obligatoires.", "MISSING_TRANSFER_REFERENCE");
  }
  if (fromLocationId === toLocationId) {
    throw businessError("La destination doit être différente de l'emplacement source.", "SAME_LOCATION");
  }

  return prismaClient.$transaction(async (tx) => {
    await assertActiveDatabaseSchema(tx);
    const [entry, activeLocationCount, source] = await Promise.all([
      tx.assetEntry.findUnique({
        where: { id: assetEntryId },
        include: {
          assetItem: {
            select: {
              id: true, status: true, deletedAt: true,
              category: { select: { hierarchyLevel: true, trackingMode: true, status: true, deletedAt: true } }
            }
          }
        }
      }),
      tx.location.count({ where: { id: { in: [fromLocationId, toLocationId] }, status: "ACTIVE", deletedAt: null } }),
      tx.quantitativeStockPosition.findUnique({
        where: { assetEntryId_locationId: { assetEntryId, locationId: fromLocationId } }
      })
    ]);

    const family = entry?.assetItem?.category;
    if (!entry || entry.assetItem?.status !== "ACTIVE" || entry.assetItem?.deletedAt || !family || family.hierarchyLevel !== "FAMILY" || family.status !== "ACTIVE" || family.deletedAt) {
      throw businessError("Lot quantitatif ou famille active introuvable.", "INVALID_QUANTITATIVE_ENTRY", 404);
    }
    if (family.trackingMode !== "Q") {
      throw businessError("TRACKING_MODE_NOT_OPERATIONAL", "TRACKING_MODE_NOT_OPERATIONAL", 409);
    }
    if (activeLocationCount !== 2) {
      throw businessError("Un emplacement actif est introuvable.", "INACTIVE_LOCATION", 404);
    }
    if (!source) throw businessError("Position source introuvable.", "SOURCE_POSITION_NOT_FOUND", 404);

    const decremented = await tx.quantitativeStockPosition.updateMany({
      where: { id: source.id, availableQuantity: { gte: quantity } },
      data: { availableQuantity: { decrement: quantity }, updatedById: actor.id }
    });
    if (decremented.count !== 1) {
      throw businessError("Stock insuffisant ou déjà consommé par une opération concurrente.", "INSUFFICIENT_STOCK", 409);
    }

    const destination = await tx.quantitativeStockPosition.upsert({
      where: { assetEntryId_locationId: { assetEntryId, locationId: toLocationId } },
      create: { assetEntryId, locationId: toLocationId, availableQuantity: quantity, createdById: actor.id, updatedById: actor.id },
      update: { availableQuantity: { increment: quantity }, updatedById: actor.id }
    });

    const movementNumber = await generateMovementNumber(tx, movementDate, 1);
    if (beforeMovementCreate) await beforeMovementCreate(tx);
    const movement = await tx.assetMovement.create({
      data: {
        movementNumber,
        movementType: "STOCK_TRANSFER",
        movementStatus: "VALIDATED",
        movementDate,
        reason,
        notes,
        createdById: actor.id,
        updatedById: actor.id,
        validatedById: actor.id,
        validatedAt: new Date(),
        quantitativeLines: {
          create: { assetEntryId, fromLocationId, toLocationId, quantity, lineNotes: notes }
        }
      },
      include: { quantitativeLines: true }
    });

    await tx.auditLog.createMany({
      data: [
        {
          action: "QUANTITATIVE_STOCK_TRANSFERRED", entityTable: "asset_movements", entityId: movement.id,
          summary: `Transfert quantitatif ${movement.movementNumber}`,
          metadata: JSON.stringify({ assetEntryId, fromLocationId, toLocationId, quantity }), userId: actor.id
        },
        {
          action: "QUANTITATIVE_STOCK_POSITION_UPDATED", entityTable: "quantitative_stock_positions", entityId: source.id,
          summary: `Stock source décrémenté par ${movement.movementNumber}`,
          metadata: JSON.stringify({ quantity, destinationPositionId: destination.id }), userId: actor.id
        }
      ]
    });

    return { movement, destination, transferredQuantity: quantity };
  }, { maxWait: 10000, timeout: 30000 });
}
