import { createDeleteHandler, createGetByIdHandler, createPatchHandler } from "@/lib/reference-api";
import { validateAssetCategoryMutation } from "@/lib/asset-reference-foundation";

const config = {
  model: "assetCategory",
  table: "asset_categories",
  auditName: "categorie",
  fields: ["name", "code", "description", "hierarchyLevel", "parentId", "trackingMode", "controlLevel", "status"],
  validate: validateAssetCategoryMutation
};

export const GET = createGetByIdHandler(config);
export const PATCH = createPatchHandler(config);
export const DELETE = createDeleteHandler(config);
