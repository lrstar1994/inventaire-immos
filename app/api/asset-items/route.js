import { createListHandler, createPostHandler } from "@/lib/reference-api";
import { validateAssetItemFamily } from "@/lib/asset-reference-foundation";

const config = {
  model: "assetItem",
  table: "asset_items",
  auditName: "article modele",
  required: ["name", "code", "categoryId"],
  fields: ["name", "code", "description", "unitLabel", "depreciationYears", "categoryId", "supplierId", "status"],
  validate: validateAssetItemFamily,
  searchable: ["name", "code", "description"]
};

export const GET = createListHandler(config);
export const POST = createPostHandler(config);
