import { createListHandler, createPostHandler } from "@/lib/reference-api";

const config = {
  model: "supplier",
  table: "suppliers",
  auditName: "fournisseur",
  fields: ["name", "code", "supplierType", "contactName", "email", "phone", "address", "notes", "status"],
  searchable: ["name", "code", "supplierType"]
};

export const GET = createListHandler(config);
export const POST = createPostHandler(config);
