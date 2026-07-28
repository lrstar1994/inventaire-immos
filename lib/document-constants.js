export const DOCUMENT_TYPES = [
  { code: "ENTRY_SLIP", label: "Bon d'entree", activeInLot4: true },
  { code: "PROGRESSIVE_INVENTORY_SHEET", label: "Fiche d'inventaire progressif", activeInLot4: true },
  { code: "ASSIGNMENT_SLIP", label: "Bon d'affectation", activeInLot4: false },
  { code: "MOVEMENT_SLIP", label: "Bon de deplacement", activeInLot4: false },
  { code: "BATCH_MOVEMENT_SLIP", label: "Bon de deplacement groupe", activeInLot4: false },
  { code: "ISSUE_REPORT", label: "Fiche de signalement", activeInLot4: false },
  { code: "REPAIR_SHEET", label: "Fiche d'intervention/reparation", activeInLot4: false },
  { code: "PERIODIC_INVENTORY_SHEET", label: "Fiche d'inventaire periodique", activeInLot4: false },
  { code: "DISCREPANCY_SHEET", label: "Fiche d'ecart", activeInLot4: false },
  { code: "REGULARIZATION_SLIP", label: "Bon de regularisation", activeInLot4: false },
  { code: "TEMPORARY_EXIT_SLIP", label: "Bon de sortie temporaire", activeInLot4: false },
  { code: "RETURN_SLIP", label: "Bon de retour", activeInLot4: false },
  { code: "FINAL_EXIT_SLIP", label: "Bon de sortie definitive", activeInLot4: false }
];

export const DOCUMENT_STATUSES = [
  { code: "DRAFT", label: "Brouillon" },
  { code: "VALIDATED", label: "Valide" },
  { code: "CANCELLED", label: "Annule" }
];

export const SENSITIVE_ACTIONS = [
  "ASSET_FINAL_EXIT",
  "ASSET_STATUS_RETIRED",
  "ASSET_UNIT_DISABLED",
  "VALIDATED_DOCUMENT_CANCEL",
  "VALIDATED_DOCUMENT_CORRECTION",
  "VALIDATED_PURCHASE_PRICE_CHANGE",
  "VALIDATED_SUPPLIER_OR_INVOICE_CHANGE",
  "ASSET_CODE_CORRECTION",
  "IMPORTANT_INVENTORY_REGULARIZATION",
  "IMPORTANT_RETROACTIVE_CORRECTION"
];

export function isDocumentTypeAllowedInLot4(code) {
  return DOCUMENT_TYPES.some((item) => item.code === code && item.activeInLot4);
}
