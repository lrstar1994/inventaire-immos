import { createListHandler, createPostHandler } from "@/lib/reference-api";
import { validateAssetItemFamily } from "@/lib/asset-reference-foundation";
import { authorizeApiRequest } from "@/lib/authorization-http";
import { jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const config = {
  model: "assetItem",
  table: "asset_items",
  auditName: "article modele",
  required: ["name", "code", "categoryId"],
  fields: ["name", "code", "description", "unitLabel", "depreciationYears", "categoryId", "supplierId", "status"],
  validate: validateAssetItemFamily,
  searchable: ["name", "code", "description"]
};

const listHandler = createListHandler(config);

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("picker") !== "true") return listHandler(request);

  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "20", 10);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 50) : 20;
  const search = (url.searchParams.get("search") || "").trim();
  const items = await prisma.assetItem.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      category: { hierarchyLevel: "FAMILY", status: "ACTIVE", deletedAt: null },
      ...(search ? { OR: [
        { name: { contains: search } },
        { code: { contains: search } },
        { category: { name: { contains: search } } }
      ] } : {})
    },
    select: { id: true, code: true, name: true, category: { select: { name: true, trackingMode: true } } },
    orderBy: [{ name: "asc" }, { code: "asc" }],
    take: limit
  });
  return jsonOk({ items, limit });
}
export const POST = createPostHandler(config);
