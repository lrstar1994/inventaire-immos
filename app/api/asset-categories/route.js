import { createListHandler, createPostHandler } from "@/lib/reference-api";

const config = {
  model: "assetCategory",
  table: "asset_categories",
  auditName: "categorie",
  fields: ["name", "code", "description", "parentId", "status"],
  searchable: ["name", "code", "description"]
};

export const GET = createListHandler(config);
export const POST = createPostHandler(config);
