import "server-only";

import { prisma } from "@/lib/prisma";
import { toAssetUnitsAccessDtos } from "@/lib/storage/asset-file-access-dto";

export const DEFAULT_ASSET_UNIT_PAGE_SIZE = 25;
export const MAX_ASSET_UNIT_PAGE_SIZE = 50;

export const assetUnitListSelect = {
  id: true,
  assetCode: true,
  serialNumber: true,
  condition: true,
  status: true,
  informationStatus: true,
  possibleDuplicate: true,
  assetItem: { select: { id: true, name: true, code: true, categoryId: true } },
  location: { select: { id: true, name: true, code: true } },
  entry: { select: { id: true, entryNumber: true, entryType: true, entryStatus: true } },
  documentLines: {
    where: { document: { documentType: "ENTRY_SLIP" } },
    select: { document: { select: { id: true, documentNumber: true, documentType: true, status: true } } },
    orderBy: { createdAt: "desc" },
    take: 1
  },
  movementLines: {
    select: {
      movement: { select: { id: true, movementNumber: true, movementType: true, movementStatus: true, movementDate: true } },
      fromLocation: { select: { id: true, name: true, code: true } },
      toLocation: { select: { id: true, name: true, code: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 1
  },
  assetFiles: {
    where: { deletedAt: null, mimeType: { startsWith: "image/" } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    take: 1
  }
};

export function boundedPositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export function buildAssetUnitListWhere(filters = {}) {
  const where = { deletedAt: null };
  const text = String(filters.q || "").trim();
  if (filters.condition) where.condition = filters.condition;
  if (filters.status) where.status = filters.status;
  if (filters.informationStatus) where.informationStatus = filters.informationStatus;
  if (filters.assetItemId) where.assetItemId = filters.assetItemId;
  if (filters.locationId) where.locationId = filters.locationId;
  if (Array.isArray(filters.categoryIds) && filters.categoryIds.length) {
    where.assetItem = { categoryId: { in: filters.categoryIds.slice(0, 100) } };
  }
  if (text) {
    where.OR = [
      { assetCode: { contains: text } },
      { serialNumber: { contains: text } },
      { notes: { contains: text } },
      { assetItem: { name: { contains: text } } },
      { assetItem: { code: { contains: text } } },
      { location: { name: { contains: text } } }
    ];
  }
  return where;
}

export async function listAssetUnitsPage({
  filters = {},
  page = 1,
  pageSize = DEFAULT_ASSET_UNIT_PAGE_SIZE,
  prismaClient = prisma
} = {}) {
  const safePageSize = boundedPositiveInteger(pageSize, DEFAULT_ASSET_UNIT_PAGE_SIZE, MAX_ASSET_UNIT_PAGE_SIZE);
  const safePage = boundedPositiveInteger(page, 1, Number.MAX_SAFE_INTEGER);
  const where = buildAssetUnitListWhere(filters);
  const [units, total] = await Promise.all([
    prismaClient.assetUnit.findMany({
      where,
      select: assetUnitListSelect,
      orderBy: { assetCode: "asc" },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize
    }),
    prismaClient.assetUnit.count({ where })
  ]);
  return {
    units: await toAssetUnitsAccessDtos(units),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize))
    }
  };
}
