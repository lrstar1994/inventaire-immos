import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { ASSET_CONDITIONS, ASSET_STATUSES, INFORMATION_STATUSES, isAllowed } from "@/lib/asset-constants";
import { parseDate, parseIntOrNull } from "@/lib/asset-service";
import { writeAuditLog } from "@/lib/audit";
import { canManageAssets } from "@/lib/roles";
import { getRequestUser } from "@/lib/request-user";

const include = {
  assetItem: { select: { id: true, name: true, code: true, categoryId: true } },
  location: { select: { id: true, name: true, code: true } },
  supplier: { select: { id: true, name: true, code: true } },
  entry: { select: { id: true, entryNumber: true, entryType: true, entryStatus: true, entryDate: true, quantity: true } },
  documentLines: {
    include: {
      document: { select: { id: true, documentNumber: true, documentType: true, status: true, documentDate: true } }
    },
    orderBy: { createdAt: "desc" }
  },
  movementLines: {
    include: {
      movement: { select: { id: true, movementNumber: true, movementType: true, movementStatus: true, movementDate: true, reason: true, notes: true } },
      fromLocation: { select: { id: true, name: true, code: true } },
      toLocation: { select: { id: true, name: true, code: true } }
    },
    orderBy: { createdAt: "desc" }
  },
  assetFiles: {
    where: { deletedAt: null },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }]
  }
};

export async function GET(_request, { params }) {
  const { id } = await params;
  const unit = await prisma.assetUnit.findFirst({ where: { id, deletedAt: null }, include });
  if (!unit) return jsonError("Bien introuvable.", 404);
  return jsonOk({ unit });
}

export async function PATCH(request, { params }) {
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssets(actor.role)) {
    return jsonError("Droits insuffisants pour modifier un bien.", 403);
  }

  const { id } = await params;
  const body = await readJson(request);
  const data = { updatedById: actor.id };

  if (body.condition !== undefined) {
    if (!isAllowed(body.condition, ASSET_CONDITIONS)) return jsonError("condition est invalide.");
    data.condition = body.condition;
  }
  if (body.status !== undefined) {
    if (!isAllowed(body.status, ASSET_STATUSES)) return jsonError("status est invalide.");
    data.status = body.status;
  }
  if (body.informationStatus !== undefined) {
    if (!isAllowed(body.informationStatus, INFORMATION_STATUSES)) return jsonError("informationStatus est invalide.");
    data.informationStatus = body.informationStatus;
  }
  if (body.serialNumber !== undefined) data.serialNumber = body.serialNumber || null;
  if (body.purchaseDateKnown !== undefined) data.purchaseDateKnown = body.purchaseDateKnown === true || body.purchaseDateKnown === "true";
  if (body.purchaseDate !== undefined) data.purchaseDate = data.purchaseDateKnown === false ? null : parseDate(body.purchaseDate);
  if (body.unitPrice !== undefined) data.unitPrice = parseIntOrNull(body.unitPrice);
  if (body.priceKnown !== undefined) data.priceKnown = body.priceKnown === true || body.priceKnown === "true" || data.unitPrice !== null;
  if (body.invoiceAvailable !== undefined) data.invoiceAvailable = body.invoiceAvailable === true || body.invoiceAvailable === "true";
  if (body.invoiceReference !== undefined) data.invoiceReference = data.invoiceAvailable === false ? null : body.invoiceReference || null;
  if (body.warrantyEndDate !== undefined) data.warrantyEndDate = parseDate(body.warrantyEndDate);
  if (body.notes !== undefined) data.notes = body.notes || null;

  const unit = await prisma.assetUnit.update({ where: { id }, data, include });
  await writeAuditLog({
    action: "ASSET_UNIT_UPDATED",
    entityTable: "asset_units",
    entityId: unit.id,
    summary: `Modification du bien ${unit.assetCode}`,
    metadata: data,
    userId: actor.id
  });

  return jsonOk({ unit });
}

export async function DELETE(request, { params }) {
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssets(actor.role)) {
    return jsonError("Droits insuffisants pour desactiver un bien.", 403);
  }

  const { id } = await params;
  const unit = await prisma.assetUnit.update({
    where: { id },
    data: { deletedAt: new Date(), updatedById: actor.id },
    include
  });

  await writeAuditLog({
    action: "ASSET_UNIT_DISABLED",
    entityTable: "asset_units",
    entityId: unit.id,
    summary: `Desactivation du bien ${unit.assetCode}`,
    userId: actor.id
  });

  return jsonOk({ unit });
}
