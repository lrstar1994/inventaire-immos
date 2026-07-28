import { createDeleteHandler, createGetByIdHandler, createPatchHandler } from "@/lib/reference-api";

const config = {
  model: "location",
  table: "locations",
  auditName: "emplacement",
  fields: ["name", "code", "locationType", "parentId", "notes", "status"]
};

export const GET = createGetByIdHandler(config);
export const PATCH = createPatchHandler(config);
export const DELETE = createDeleteHandler(config);
