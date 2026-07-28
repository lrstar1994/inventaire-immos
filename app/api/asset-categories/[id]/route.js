import { createDeleteHandler, createGetByIdHandler, createPatchHandler } from "@/lib/reference-api";

const config = {
  model: "assetCategory",
  table: "asset_categories",
  auditName: "categorie",
  fields: ["name", "code", "description", "parentId", "status"]
};

export const GET = createGetByIdHandler(config);
export const PATCH = createPatchHandler(config);
export const DELETE = createDeleteHandler(config);
