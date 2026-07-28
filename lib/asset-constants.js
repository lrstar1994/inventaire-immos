export const ASSET_CONDITIONS = [
  { code: "NEW", label: "Neuf" },
  { code: "VERY_GOOD", label: "Tres bon etat" },
  { code: "GOOD", label: "Bon etat" },
  { code: "FAIR", label: "Etat moyen" },
  { code: "WORN", label: "Use" },
  { code: "TO_REPAIR", label: "A reparer" },
  { code: "OUT_OF_ORDER", label: "Hors service" }
];

export const ASSET_STATUSES = [
  { code: "IN_SERVICE", label: "En service" },
  { code: "IN_STOCK", label: "En stock" },
  { code: "IN_REPAIR", label: "En reparation" },
  { code: "TEMPORARILY_OUT", label: "Sortie temporaire" },
  { code: "MISSING", label: "Manquant" },
  { code: "RETIRED", label: "Sorti definitivement" }
];

export const INFORMATION_STATUSES = [
  { code: "COMPLETE", label: "Complet" },
  { code: "PARTIAL", label: "Partiel" },
  { code: "TO_COMPLETE", label: "A completer" },
  { code: "UNKNOWN_INFO", label: "Informations inconnues" }
];

export const ENTRY_TYPES = [
  { code: "PURCHASE", label: "Achat" },
  { code: "EXISTING_STOCK", label: "Reprise de l'existant" },
  { code: "DONATION", label: "Don" },
  { code: "INCOMING_TRANSFER", label: "Transfert entrant" },
  { code: "PROGRESSIVE_INVENTORY", label: "Inventaire progressif" }
];

export const ENTRY_STATUSES = [
  { code: "DRAFT", label: "Brouillon" },
  { code: "VALIDATED", label: "Validee" },
  { code: "CANCELLED", label: "Annulee" }
];

export function isAllowed(code, list) {
  return list.some((item) => item.code === code);
}
