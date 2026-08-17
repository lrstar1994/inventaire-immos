import { createListHandler, createPostHandler } from "@/lib/reference-api";
import { validateAssetCategoryMutation } from "@/lib/asset-reference-foundation";

const config = {
  model: "assetCategory",
  table: "asset_categories",
  auditName: "categorie",
  fields: ["name", "code", "description", "hierarchyLevel", "parentId", "trackingMode", "controlLevel", "status"],
  validate: validateAssetCategoryMutation,
  searchable: ["name", "code", "description"]
};

export const GET = createListHandler(config);
export const POST = createPostHandler(config);
