import { createListHandler, createPostHandler } from "@/lib/reference-api";
import { validateAssetCategoryMutation } from "@/lib/asset-reference-foundation";
import { authorizeApiRequest } from "@/lib/authorization-http";
import { jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const config = {
  model: "assetCategory",
  table: "asset_categories",
  auditName: "categorie",
  fields: ["name", "code", "description", "hierarchyLevel", "parentId", "trackingMode", "controlLevel", "status"],
  validate: validateAssetCategoryMutation,
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
  const items = await prisma.assetCategory.findMany({
    where: { hierarchyLevel: "FAMILY", status: "ACTIVE", deletedAt: null, trackingMode: { in: ["I", "Q", "QI"] }, ...(search ? { OR: [{ name: { contains: search } }, { code: { contains: search } }] } : {}) },
    select: { id: true, name: true, code: true, trackingMode: true },
    orderBy: [{ name: "asc" }, { code: "asc" }],
    take: limit
  });
  return jsonOk({ items, limit });
}
export const POST = createPostHandler(config);
