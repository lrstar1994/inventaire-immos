import { createListHandler, createPostHandler } from "@/lib/reference-api";

const config = {
  model: "location",
  table: "locations",
  auditName: "emplacement",
  fields: ["name", "code", "locationType", "parentId", "notes", "status"],
  searchable: ["name", "code", "locationType"]
};

export const GET = createListHandler(config);
export const POST = createPostHandler(config);
