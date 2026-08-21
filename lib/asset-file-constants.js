export const ASSET_FILE_TYPES = [
  { code: "MAIN_PHOTO", label: "Photo principale", category: "image" },
  { code: "GENERAL_VIEW", label: "Vue generale", category: "image" },
  { code: "DETAIL_VIEW", label: "Detail / angle complementaire", category: "image" },
  { code: "DEFECT_PHOTO", label: "Defaut ou probleme", category: "image" },
  { code: "SERIAL_OR_LABEL", label: "Numero de serie, etiquette, code", category: "image" },
  { code: "INVOICE", label: "Facture", category: "document" },
  { code: "WARRANTY", label: "Garantie", category: "document" },
  { code: "OTHER", label: "Autre", category: "mixed" }
];

export const ASSET_FILE_KINDS = [
  { code: "MATERIAL_PHOTO", label: "Photo du matériel" },
  { code: "SUPPORTING_DOCUMENT", label: "Pièce justificative" }
];

export const MAX_ASSET_FILE_SIZE = 10 * 1024 * 1024;

export const ACCEPTED_ASSET_FILE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

export const ACCEPTED_ASSET_FILE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
];

export function assetFileTypeLabel(code) {
  return ASSET_FILE_TYPES.find((item) => item.code === code)?.label || code;
}

export function isAssetFileType(code) {
  return ASSET_FILE_TYPES.some((item) => item.code === code);
}

export function isAssetFileKind(code) {
  return ASSET_FILE_KINDS.some((item) => item.code === code);
}

export function inferAssetFileKind(fileType, mimeType) {
  if (["INVOICE", "WARRANTY"].includes(fileType)) return "SUPPORTING_DOCUMENT";
  return isImageMimeType(mimeType) ? "MATERIAL_PHOTO" : "SUPPORTING_DOCUMENT";
}

export function isImageMimeType(mimeType) {
  return String(mimeType || "").startsWith("image/");
}
