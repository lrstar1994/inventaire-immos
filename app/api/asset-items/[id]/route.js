import { createDeleteHandler, createGetByIdHandler, createPatchHandler } from "@/lib/reference-api";

const config = {
  model: "assetItem",
  table: "asset_items",
  auditName: "article modele",
  fields: ["name", "code", "description", "unitLabel", "categoryId", "supplierId", "status"]
};

export const GET = createGetByIdHandler(config);
export const PATCH = createPatchHandler(config);
export const DELETE = createDeleteHandler(config);
