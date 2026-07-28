import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { isMovementTypeAllowedInLot5, movementRequiresDetails } from "@/lib/movement-constants";

const RETURN_MOVEMENT_TYPES = ["RETURN_FROM_LOAN_EVENT", "RETURN_FROM_WORKSHOP_REPAIR"];

function yearFrom(date = new Date()) {
  return new Date(date).getFullYear();
}

function extractSequence(code, prefix) {
  const match = String(code).match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d{6})$`));
  return match ? Number.parseInt(match[1], 10) : 0;
}

export function parseMovementDate(value) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export async function generateMovementNumber(tx, movementDate, lineCount) {
  const prefix = lineCount > 1 ? `MVT-GRP-${yearFrom(movementDate)}` : `MVT-${yearFrom(movementDate)}`;
  const existing = await tx.assetMovement.findMany({
    where: { movementNumber: { startsWith: `${prefix}-` } },
    select: { movementNumber: true }
  });
  const max = existing.reduce((current, item) => Math.max(current, extractSequence(item.movementNumber, prefix)), 0);
  return `${prefix}-${String(max + 1).padStart(6, "0")}`;
}

export function movementInclude() {
  return {
    lines: {
      include: {
        assetUnit: {
          include: {
            assetItem: { select: { id: true, name: true, code: true } },
            location: { select: { id: true, name: true, code: true } }
          }
        },
        fromLocation: { select: { id: true, name: true, code: true } },
        toLocation: { select: { id: true, name: true, code: true } }
      },
      orderBy: { createdAt: "asc" }
    },
    relatedMovement: { select: { id: true, movementNumber: true, movementType: true, movementDate: true } }
  };
}

async function assertActiveLocations(tx, locationIds) {
  const ids = [...new Set(locationIds.filter(Boolean))];
  const count = await tx.location.count({ where: { id: { in: ids }, status: "ACTIVE", deletedAt: null } });
  if (count !== ids.length) throw new Error("Un ou plusieurs emplacements actifs sont introuvables.");
}

async function buildMovementLines(tx, lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error("Au moins une ligne de mouvement est obligatoire.");
  const uniqueAssetIds = [...new Set(lines.map((line) => line.assetUnitId).filter(Boolean))];
  if (uniqueAssetIds.length !== lines.length) throw new Error("Chaque bien ne peut apparaitre qu'une seule fois dans le mouvement.");

  const units = await tx.assetUnit.findMany({
    where: {
      id: { in: uniqueAssetIds },
      deletedAt: null,
      status: { not: "RETIRED" }
    },
    include: { location: true, assetItem: true }
  });
  if (units.length !== uniqueAssetIds.length) throw new Error("Un ou plusieurs biens sont introuvables, supprimes ou sortis definitivement.");

  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const toLocationIds = lines.map((line) => line.toLocationId);
  await assertActiveLocations(tx, toLocationIds);

  return lines.map((line) => {
    const unit = unitById.get(line.assetUnitId);
    if (!line.toLocationId) throw new Error("Emplacement d'arrivee obligatoire.");
    if (unit.locationId === line.toLocationId) throw new Error(`Le bien ${unit.assetCode} est deja dans cet emplacement.`);
    return {
      assetUnitId: unit.id,
      fromLocationId: unit.locationId,
      toLocationId: line.toLocationId,
      lineNotes: line.lineNotes || null
    };
  });
}

export async function createMovement(body, actor) {
  return prisma.$transaction(async (tx) => {
    const movementType = body.movementType || "LOCATION_CHANGE";
    if (!isMovementTypeAllowedInLot5(movementType)) throw new Error("Type de mouvement non exploite dans le Lot 5.");
    const notes = String(body.notes || "").trim();
    if (movementRequiresDetails(movementType) && !notes) {
      throw new Error("Explication du mouvement obligatoire pour ce type de mouvement.");
    }
    const movementDate = parseMovementDate(body.movementDate);
    const builtLines = await buildMovementLines(tx, body.lines);
    const relatedMovementId = body.relatedMovementId || null;
    if (relatedMovementId) {
      if (!RETURN_MOVEMENT_TYPES.includes(movementType)) {
        throw new Error("Un mouvement lie est accepte uniquement pour les retours.");
      }
      const related = await tx.assetMovement.findUnique({
        where: { id: relatedMovementId },
        include: { lines: true }
      });
      if (!related || related.movementStatus !== "VALIDATED") {
        throw new Error("Mouvement de depart lie introuvable ou non valide.");
      }
      const lineAssetIds = new Set(builtLines.map((line) => line.assetUnitId));
      const relatedAssetIds = new Set(related.lines.map((line) => line.assetUnitId));
      const allLinked = [...lineAssetIds].every((id) => relatedAssetIds.has(id));
      if (!allLinked) throw new Error("Le mouvement de depart lie ne concerne pas le bien selectionne.");
    }
    const movementNumber = await generateMovementNumber(tx, movementDate, builtLines.length);
    const movement = await tx.assetMovement.create({
      data: {
        movementNumber,
        movementType,
        movementStatus: "DRAFT",
        movementDate,
        reason: String(body.reason || "").trim() || "Mouvement de parc",
        notes: notes || null,
        relatedMovementId,
        createdById: actor.id,
        updatedById: actor.id,
        lines: { create: builtLines }
      },
      include: movementInclude()
    });

    return movement;
  });
}

export async function updateMovement(id, body, actor) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.assetMovement.findUnique({ where: { id }, include: movementInclude() });
    if (!current) throw new Error("Mouvement introuvable.");
    if (current.movementStatus === "VALIDATED") {
      const error = new Error("Mouvement valide verrouille.");
      error.status = 423;
      throw error;
    }
    if (current.movementStatus === "CANCELLED") throw new Error("Mouvement annule non modifiable.");

    const data = {
      reason: body.reason !== undefined ? String(body.reason || "").trim() || current.reason : current.reason,
      notes: body.notes !== undefined ? body.notes || null : current.notes,
      movementDate: body.movementDate ? parseMovementDate(body.movementDate) : current.movementDate,
      updatedById: actor.id
    };

    if (body.movementType) {
      if (!isMovementTypeAllowedInLot5(body.movementType)) throw new Error("Type de mouvement non exploite dans le Lot 5.");
      data.movementType = body.movementType;
    }
    const nextType = data.movementType || current.movementType;
    const nextNotes = data.notes !== undefined ? data.notes : current.notes;
    if (movementRequiresDetails(nextType) && !String(nextNotes || "").trim()) {
      throw new Error("Explication du mouvement obligatoire pour ce type de mouvement.");
    }

    if (Array.isArray(body.lines)) {
      const builtLines = await buildMovementLines(tx, body.lines);
      await tx.assetMovementLine.deleteMany({ where: { movementId: id } });
      await tx.assetMovementLine.createMany({ data: builtLines.map((line) => ({ ...line, movementId: id })) });
    }

    return tx.assetMovement.update({ where: { id }, data, include: movementInclude() });
  });
}

export async function validateMovement(id, actor) {
  return prisma.$transaction(async (tx) => {
    const movement = await tx.assetMovement.findUnique({ where: { id }, include: movementInclude() });
    if (!movement) throw new Error("Mouvement introuvable.");
    if (movement.movementStatus === "CANCELLED") throw new Error("Mouvement annule non validable.");
    if (movement.movementStatus === "VALIDATED") return movement;

    for (const line of movement.lines) {
      const unit = await tx.assetUnit.findUnique({ where: { id: line.assetUnitId } });
      if (!unit || unit.deletedAt || unit.status === "RETIRED") {
        const error = new Error(`Bien indisponible pour validation: ${line.assetUnit?.assetCode || line.assetUnitId}.`);
        error.status = 409;
        throw error;
      }
      if (unit.locationId !== line.fromLocationId) {
        const error = new Error(`Validation bloquee: ${unit.assetCode} a deja change d'emplacement.`);
        error.status = 409;
        throw error;
      }
    }

    for (const line of movement.lines) {
      await tx.assetUnit.update({
        where: { id: line.assetUnitId },
        data: { locationId: line.toLocationId, updatedById: actor.id }
      });
    }

    return tx.assetMovement.update({
      where: { id },
      data: {
        movementStatus: "VALIDATED",
        validatedById: actor.id,
        validatedAt: new Date(),
        updatedById: actor.id
      },
      include: movementInclude()
    });
  });
}

export async function cancelMovement(id, reason, actor) {
  const current = await prisma.assetMovement.findUnique({ where: { id } });
  if (!current) throw new Error("Mouvement introuvable.");
  if (!reason) throw new Error("Motif obligatoire pour annuler un mouvement.");
  if (current.movementStatus === "VALIDATED") {
    const error = new Error("Annulation d'un mouvement valide interdite en Lot 5 : validation Direction par code personnel requise, non encore active.");
    error.status = 423;
    throw error;
  }

  return prisma.assetMovement.update({
    where: { id },
    data: {
      movementStatus: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById: actor.id,
      cancellationReason: reason,
      updatedById: actor.id
    },
    include: movementInclude()
  });
}

export async function auditMovement(action, movement, actor, metadata = {}) {
  return writeAuditLog({
    action,
    entityTable: "asset_movements",
    entityId: movement.id,
    summary: `${action} ${movement.movementNumber}`,
    metadata,
    userId: actor?.id || null
  });
}

export async function auditMovementUnitLocationUpdates(movement, actor) {
  for (const line of movement.lines) {
    await writeAuditLog({
      action: "ASSET_UNIT_LOCATION_UPDATED_BY_MOVEMENT",
      entityTable: "asset_units",
      entityId: line.assetUnitId,
      summary: `Emplacement mis a jour par ${movement.movementNumber}`,
      metadata: {
        movementId: movement.id,
        movementNumber: movement.movementNumber,
        fromLocationId: line.fromLocationId,
        toLocationId: line.toLocationId
      },
      userId: actor.id
    });
  }
}
