import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { findPotentialAssetDuplicates, summarizeDuplicateUnit } from "@/lib/asset-service";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const assetItemId = searchParams.get("assetItemId");
  const locationId = searchParams.get("locationId");
  const supplierId = searchParams.get("supplierId") || null;
  const serialNumber = searchParams.get("serialNumber") || null;

  if (!assetItemId || !locationId) {
    return jsonError("assetItemId et locationId sont obligatoires.");
  }

  const result = await findPotentialAssetDuplicates(prisma, {
    assetItemId,
    locationId,
    supplierId,
    serialNumber
  });

  return jsonOk({
    serialDuplicateBlocked: result.serialDuplicates.length > 0,
    serialDuplicates: result.serialDuplicates.map(summarizeDuplicateUnit),
    possibleDuplicate: result.similarUnits.length > 0,
    similarUnits: result.similarUnits.map(summarizeDuplicateUnit)
  });
}
