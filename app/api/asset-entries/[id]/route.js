import { authorizeApiRequest } from "@/lib/authorization-http";
import { assertActiveDatabaseSchema, prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { ASSET_CONDITIONS, ASSET_STATUSES, ENTRY_STATUSES, INFORMATION_STATUSES, isAllowed } from "@/lib/asset-constants";
import { createUnitsForValidatedEntry, normalizePriceFields, parseDate } from "@/lib/asset-service";
import { writeAuditLog } from "@/lib/audit";
import { canManageAssets } from "@/lib/roles";
import { getRequestUser } from "@/lib/request-user";

const include = {
  assetItem: { select: { id: true, name: true, code: true } },
  location: { select: { id: true, name: true, code: true } },
  supplier: { select: { id: true, name: true, code: true } },
  assetUnits: { select: { id: true, assetCode: true, status: true, condition: true } }
};

export async function GET(_request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const { id } = await params;
  const entry = await prisma.assetEntry.findUnique({ where: { id }, include });
  if (!entry) return jsonError("Entree introuvable.", 404);
  return jsonOk({ entry });
}

export async function PATCH(request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssets(actor.role)) {
    return jsonError("Droits insuffisants pour modifier une entree de parc.", 403);
  }

  const { id } = await params;
  const body = await readJson(request);

  try {
    const result = await prisma.$transaction(async (tx) => {
      await assertActiveDatabaseSchema(tx);
      const current = await tx.assetEntry.findUnique({ where: { id } });
      if (!current) throw new Error("Entree introuvable.");
      if (current.entryStatus === "CANCELLED") throw new Error("Une entree annulee ne peut pas etre modifiee.");

      const data = { updatedById: actor.id };
      if (body.initialCondition !== undefined) {
        if (!isAllowed(body.initialCondition, ASSET_CONDITIONS)) throw new Error("initialCondition est invalide.");
        data.initialCondition = body.initialCondition;
      }
      if (body.initialStatus !== undefined) {
        if (!isAllowed(body.initialStatus, ASSET_STATUSES)) throw new Error("initialStatus est invalide.");
        data.initialStatus = body.initialStatus;
      }
      if (body.entryStatus !== undefined) {
        if (!isAllowed(body.entryStatus, ENTRY_STATUSES)) throw new Error("entryStatus est invalide.");
        data.entryStatus = body.entryStatus;
      }
      if (body.informationStatus !== undefined) {
        if (!isAllowed(body.informationStatus, INFORMATION_STATUSES)) throw new Error("informationStatus est invalide.");
        data.informationStatus = body.informationStatus;
      }
      if (body.purchaseDateKnown !== undefined) data.purchaseDateKnown = body.purchaseDateKnown === true || body.purchaseDateKnown === "true";
      if (body.purchaseDate !== undefined) data.purchaseDate = data.purchaseDateKnown === false ? null : parseDate(body.purchaseDate);
      if (body.invoiceAvailable !== undefined) data.invoiceAvailable = body.invoiceAvailable === true || body.invoiceAvailable === "true";
      if (body.invoiceReference !== undefined) data.invoiceReference = data.invoiceAvailable === false ? null : body.invoiceReference || null;
      if (body.notes !== undefined) data.notes = body.notes || null;

      if (body.unitPrice !== undefined || body.totalPrice !== undefined || body.priceKnown !== undefined) {
        const prices = normalizePriceFields({
          quantity: current.quantity,
          unitPrice: body.unitPrice ?? current.unitPrice,
          totalPrice: body.totalPrice ?? current.totalPrice,
          priceKnown: body.priceKnown ?? current.priceKnown
        });
        data.unitPrice = prices.unitPrice;
        data.totalPrice = prices.totalPrice;
        data.priceKnown = prices.priceKnown;
      }

      const entry = await tx.assetEntry.update({ where: { id }, data });
      const units = await createUnitsForValidatedEntry(tx, entry, actor.id);
      return { entry, units };
    });

    await writeAuditLog({
      action: result.entry.entryStatus === "VALIDATED" ? "ASSET_ENTRY_VALIDATED" : "ASSET_ENTRY_UPDATED",
      entityTable: "asset_entries",
      entityId: result.entry.id,
      summary: `Mise a jour de l'entree ${result.entry.entryNumber}`,
      metadata: { units: result.units.length, entryStatus: result.entry.entryStatus },
      userId: actor.id
    });

    return jsonOk(result);
  } catch (error) {
    return jsonError(error.message || "Modification impossible.");
  }
}
