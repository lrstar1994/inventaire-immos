import { createDeleteHandler, createGetByIdHandler, createPatchHandler } from "@/lib/reference-api";
import { validateAssetItemFamily } from "@/lib/asset-reference-foundation";

const config = {
  model: "assetItem",
  table: "asset_items",
  auditName: "article modele",
  fields: ["name", "code", "description", "unitLabel", "categoryId", "supplierId", "status"],
  validate: validateAssetItemFamily
};

export const GET = createGetByIdHandler(config);
export const PATCH = createPatchHandler(config);
export const DELETE = createDeleteHandler(config);
