import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { canManageAssets } from "@/lib/roles";
import { getRequestUser } from "@/lib/request-user";
import { auditEntryCreation, createAssetEntryWithUnits } from "@/lib/asset-service";
import { toAssetUnitsAccessDtos } from "@/lib/storage/asset-file-access-dto";

const include = {
  assetItem: { select: { id: true, name: true, code: true, categoryId: true } },
  location: { select: { id: true, name: true, code: true } },
  supplier: { select: { id: true, name: true, code: true } },
  entry: { select: { id: true, entryNumber: true, entryType: true, entryStatus: true } },
  documentLines: {
    include: {
      document: { select: { id: true, documentNumber: true, documentType: true, status: true } }
    },
    orderBy: { createdAt: "desc" }
  },
  movementLines: {
    include: {
      movement: { select: { id: true, movementNumber: true, movementType: true, movementStatus: true, movementDate: true } },
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const where = { deletedAt: null };
  const q = searchParams.get("q");

  if (searchParams.get("condition")) where.condition = searchParams.get("condition");
  if (searchParams.get("status")) where.status = searchParams.get("status");
  if (searchParams.get("informationStatus")) where.informationStatus = searchParams.get("informationStatus");
  if (searchParams.get("assetItemId")) where.assetItemId = searchParams.get("assetItemId");
  if (searchParams.get("locationId")) where.locationId = searchParams.get("locationId");
  if (q) {
    where.OR = [
      { assetCode: { contains: q } },
      { serialNumber: { contains: q } },
      { notes: { contains: q } }
    ];
  }

  const units = await prisma.assetUnit.findMany({
    where,
    include,
    orderBy: { assetCode: "asc" }
  });

  return jsonOk({ units: await toAssetUnitsAccessDtos(units) });
}

export async function POST(request) {
  const actor = await getRequestUser(request);
  if (!actor || !canManageAssets(actor.role)) {
    return jsonError("Droits insuffisants pour creer un bien.", 403);
  }

  try {
    const body = await readJson(request);
    const result = await createAssetEntryWithUnits({ ...body, quantity: 1, entryStatus: "VALIDATED" }, actor);
    await auditEntryCreation({ ...result, actor });
    return jsonOk({ entry: result.entry, unit: result.units[0] }, { status: 201 });
  } catch (error) {
    if (error.code === "POSSIBLE_DUPLICATE") {
      return jsonError(error.message, 409, { similarUnits: error.similarUnits });
    }
    return jsonError(error.message || "Creation impossible.");
  }
}
