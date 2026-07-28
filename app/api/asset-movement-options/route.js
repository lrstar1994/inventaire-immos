import { prisma } from "@/lib/prisma";
import { jsonOk } from "@/lib/api";
import { MOVEMENT_STATUSES, MOVEMENT_TYPES } from "@/lib/movement-constants";

export async function GET() {
  const [assetUnits, locations, assetCategories, assetItems] = await Promise.all([
    prisma.assetUnit.findMany({
      where: { deletedAt: null, status: { not: "RETIRED" } },
      include: {
        assetItem: {
          select: {
            id: true,
            name: true,
            code: true,
            categoryId: true,
            category: { select: { id: true, name: true, code: true, parentId: true } }
          }
        },
        location: { select: { id: true, name: true, code: true } }
      },
      orderBy: { assetCode: "asc" }
    }),
    prisma.location.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      orderBy: [{ name: "asc" }]
    }),
    prisma.assetCategory.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    }),
    prisma.assetItem.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      include: { category: { select: { id: true, name: true, code: true, parentId: true } } },
      orderBy: { name: "asc" }
    })
  ]);

  return jsonOk({
    movementTypes: MOVEMENT_TYPES,
    activeMovementTypes: MOVEMENT_TYPES.filter((item) => item.activeInLot5),
    movementStatuses: MOVEMENT_STATUSES,
    assetUnits,
    locations,
    assetCategories,
    assetItems
  });
}
