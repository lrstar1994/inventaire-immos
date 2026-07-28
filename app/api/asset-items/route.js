import { createListHandler, createPostHandler } from "@/lib/reference-api";

const config = {
  model: "assetItem",
  table: "asset_items",
  auditName: "article modele",
  required: ["name", "categoryId"],
  fields: ["name", "code", "description", "unitLabel", "categoryId", "supplierId", "status"],
  searchable: ["name", "code", "description"]
};

export const GET = createListHandler(config);
export const POST = createPostHandler(config);
