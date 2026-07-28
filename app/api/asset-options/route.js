import { prisma } from "@/lib/prisma";
import { jsonOk } from "@/lib/api";
import { ASSET_CONDITIONS, ASSET_STATUSES, ENTRY_STATUSES, ENTRY_TYPES, INFORMATION_STATUSES } from "@/lib/asset-constants";
import { assetFileOptions } from "@/lib/asset-file-service";

export async function GET() {
  const [assetItems, assetCategories, locations, suppliers] = await Promise.all([
    prisma.assetItem.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      include: {
        category: { select: { id: true, name: true, code: true, parentId: true } },
        supplier: { select: { id: true, name: true, code: true } }
      },
      orderBy: { name: "asc" }
    }),
    prisma.assetCategory.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    }),
    prisma.location.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      include: { parent: { select: { id: true, name: true, code: true } } },
      orderBy: { name: "asc" }
    }),
    prisma.supplier.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      orderBy: { name: "asc" }
    })
  ]);

  return jsonOk({
    assetItems,
    assetCategories,
    locations,
    suppliers,
    conditions: ASSET_CONDITIONS,
    statuses: ASSET_STATUSES,
    informationStatuses: INFORMATION_STATUSES,
    entryTypes: ENTRY_TYPES,
    entryStatuses: ENTRY_STATUSES,
    assetFileOptions: assetFileOptions()
  });
}
