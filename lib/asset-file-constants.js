export const ASSET_FILE_TYPES = [
  { code: "MAIN_PHOTO", label: "Photo principale", category: "image" },
  { code: "GENERAL_VIEW", label: "Vue generale", category: "image" },
  { code: "FRONT", label: "Face avant", category: "image" },
  { code: "REAR", label: "Face arrière", category: "image" },
  { code: "LEFT_SIDE", label: "Côté gauche", category: "image" },
  { code: "RIGHT_SIDE", label: "Côté droit", category: "image" },
  { code: "TOP", label: "Dessus", category: "image" },
  { code: "BOTTOM", label: "Dessous", category: "image" },
  { code: "BRAND_MODEL", label: "Marque / modèle / étiquette", category: "image" },
  { code: "SERIAL_NUMBER", label: "Numéro de série", category: "image" },
  { code: "ACCESSORIES", label: "Accessoires", category: "image" },
  { code: "VISIBLE_DEFECT", label: "Défaut visible", category: "image" },
  { code: "FULL_LOT", label: "Lot complet", category: "image" },
  { code: "REPRESENTATIVE_SAMPLE", label: "Exemplaire représentatif", category: "image" },
  { code: "PACKAGING", label: "Emballage / carton", category: "image" },
  { code: "DETAIL_VIEW", label: "Detail / angle complementaire", category: "image" },
  { code: "DEFECT_PHOTO", label: "Defaut ou probleme", category: "image" },
  { code: "SERIAL_OR_LABEL", label: "Numero de serie, etiquette, code", category: "image" },
  { code: "INVOICE", label: "Facture", category: "document" },
  { code: "DELIVERY_NOTE", label: "Bon de livraison", category: "document" },
  { code: "WARRANTY", label: "Garantie", category: "document" },
  { code: "MANUAL", label: "Notice", category: "document" },
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
  if (["INVOICE", "DELIVERY_NOTE", "WARRANTY", "MANUAL"].includes(fileType)) return "SUPPORTING_DOCUMENT";
  return isImageMimeType(mimeType) ? "MATERIAL_PHOTO" : "SUPPORTING_DOCUMENT";
}

export function isImageMimeType(mimeType) {
  return String(mimeType || "").startsWith("image/");
}
