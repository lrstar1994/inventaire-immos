import { prisma } from "@/lib/prisma";

function businessError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function text(value) {
  return String(value || "").trim();
}

const equipmentSetInclude = {
  location: { select: { id: true, name: true, code: true } },
  components: {
    where: { deletedAt: null },
    include: {
      assetUnit: { include: { assetItem: { select: { id: true, code: true, name: true } } } },
      assetEntry: { include: { assetItem: { select: { id: true, code: true, name: true } } } },
      sourceLocation: { select: { id: true, name: true, code: true } }
    },
    orderBy: { createdAt: "asc" }
  }
};

export function validateEquipmentComponentShape({ assetUnitId, assetEntryId, sourceLocationId, quantity }) {
  const unitId = text(assetUnitId) || null;
  const entryId = text(assetEntryId) || null;
  const locationId = text(sourceLocationId) || null;
  if (Boolean(unitId) === Boolean(entryId)) {
    throw businessError("Un composant doit être soit individuel, soit quantitatif.", "INVALID_COMPONENT_SHAPE");
  }
  if (unitId) {
    if (locationId || Number(quantity) !== 1) throw businessError("Un composant individuel doit avoir une quantité égale à 1 sans lot quantitatif.", "INVALID_INDIVIDUAL_COMPONENT");
    return { assetUnitId: unitId, assetEntryId: null, sourceLocationId: null, quantity: 1 };
  }
  if (!locationId || !/^[1-9]\d*$/.test(String(quantity ?? "").trim())) {
    throw businessError("Un composant quantitatif exige un lot, un emplacement et une quantité strictement positive.", "INVALID_QUANTITATIVE_COMPONENT");
  }
  return { assetUnitId: null, assetEntryId: entryId, sourceLocationId: locationId, quantity: Number(quantity) };
}

export async function createEquipmentSet(body, actor, { prismaClient = prisma } = {}) {
  const code = text(body.code).toUpperCase();
  const name = text(body.name);
  const locationId = text(body.locationId);
  if (!code || !name || !locationId) throw businessError("Code, nom et emplacement sont obligatoires.", "INVALID_EQUIPMENT_SET");
  return prismaClient.$transaction(async (tx) => {
    const [location, duplicate] = await Promise.all([
      tx.location.findFirst({ where: { id: locationId, status: "ACTIVE", deletedAt: null } }),
      tx.equipmentSet.findFirst({ where: { code, deletedAt: null } })
    ]);
    if (!location) throw businessError("Emplacement actif introuvable.", "INACTIVE_LOCATION", 404);
    if (duplicate) throw businessError("Ce code d'ensemble existe déjà.", "DUPLICATE_EQUIPMENT_SET_CODE", 409);
    return tx.equipmentSet.create({ data: { code, name, description: text(body.description) || null, locationId, status: "DRAFT", createdById: actor.id, updatedById: actor.id } });
  });
}

export async function getEquipmentSet(id, { prismaClient = prisma } = {}) {
  return prismaClient.equipmentSet.findFirst({
    where: { id: text(id), deletedAt: null },
    include: equipmentSetInclude
  });
}

export async function listEquipmentSets({ includeDisabled = false } = {}, { prismaClient = prisma } = {}) {
  return prismaClient.equipmentSet.findMany({
    where: includeDisabled ? {} : { deletedAt: null, status: { not: "DISABLED" } },
    include: equipmentSetInclude,
    orderBy: [{ name: "asc" }, { code: "asc" }]
  });
}

export async function addEquipmentSetComponent(equipmentSetId, body, actor, { prismaClient = prisma } = {}) {
  const shape = validateEquipmentComponentShape(body);
  return prismaClient.$transaction(async (tx) => {
    const equipmentSet = await tx.equipmentSet.findFirst({ where: { id: text(equipmentSetId), deletedAt: null, status: { not: "DISABLED" } } });
    if (!equipmentSet) throw businessError("Ensemble actif introuvable.", "EQUIPMENT_SET_NOT_FOUND", 404);

    if (shape.assetUnitId) {
      const [unit, existing] = await Promise.all([
        tx.assetUnit.findFirst({ where: { id: shape.assetUnitId, deletedAt: null, status: { not: "RETIRED" } } }),
        tx.equipmentSetComponent.findFirst({ where: { assetUnitId: shape.assetUnitId, deletedAt: null } })
      ]);
      if (!unit || unit.locationId !== equipmentSet.locationId) throw businessError("Unité active absente de l'emplacement de l'ensemble.", "INVALID_ASSET_UNIT", 409);
      if (existing) throw businessError("Cette unité appartient déjà à un ensemble.", "ASSET_UNIT_ALREADY_ASSIGNED", 409);
    } else {
      if (shape.sourceLocationId !== equipmentSet.locationId) throw businessError("Le stock quantitatif doit provenir de l'emplacement de l'ensemble.", "LOCATION_MISMATCH", 409);
      const [position, allocated] = await Promise.all([
        tx.quantitativeStockPosition.findUnique({ where: { assetEntryId_locationId: { assetEntryId: shape.assetEntryId, locationId: shape.sourceLocationId } } }),
        tx.equipmentSetComponent.aggregate({ where: { assetEntryId: shape.assetEntryId, sourceLocationId: shape.sourceLocationId, deletedAt: null }, _sum: { quantity: true } })
      ]);
      const alreadyReferenced = allocated._sum.quantity || 0;
      if (!position || alreadyReferenced + shape.quantity > position.availableQuantity) {
        throw businessError("Quantité supérieure au stock disponible non encore référencé.", "INSUFFICIENT_QUANTITATIVE_STOCK", 409);
      }
    }

    return tx.equipmentSetComponent.create({ data: { equipmentSetId: equipmentSet.id, ...shape, notes: text(body.notes) || null, createdById: actor.id, updatedById: actor.id } });
  });
}

export async function disableEquipmentSet(id, actor, { prismaClient = prisma } = {}) {
  return prismaClient.equipmentSet.update({ where: { id: text(id) }, data: { status: "DISABLED", deletedAt: new Date(), updatedById: actor.id } });
}
