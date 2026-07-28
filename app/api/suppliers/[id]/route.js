import { createDeleteHandler, createGetByIdHandler, createPatchHandler } from "@/lib/reference-api";

const config = {
  model: "supplier",
  table: "suppliers",
  auditName: "fournisseur",
  fields: ["name", "code", "supplierType", "contactName", "email", "phone", "address", "notes", "status"]
};

export const GET = createGetByIdHandler(config);
export const PATCH = createPatchHandler(config);
export const DELETE = createDeleteHandler(config);
