export const MOVEMENT_TYPES = [
  { code: "ASSIGNMENT", label: "Affectation initiale", activeInLot5: true },
  { code: "REASSIGNMENT", label: "Reaffectation", activeInLot5: true },
  { code: "LOAN_EVENT", label: "Depart pour pret / evenement", activeInLot5: true },
  { code: "RETURN_FROM_LOAN_EVENT", label: "Retour de pret / evenement", activeInLot5: true },
  { code: "WORKSHOP_REPAIR", label: "Depart vers atelier / reparation", activeInLot5: true },
  { code: "RETURN_FROM_WORKSHOP_REPAIR", label: "Retour d'atelier / reparation", activeInLot5: true },
  { code: "LOCATION_CHANGE", label: "Changement d'emplacement", activeInLot5: false },
  { code: "ROOM_TRANSFER", label: "Transfert entre chambres", activeInLot5: false },
  { code: "STOCK_TRANSFER", label: "Transfert stock", activeInLot5: false },
  { code: "TEMPORARY_EXIT", label: "Sortie temporaire", activeInLot5: false },
  { code: "RETURN_FROM_TEMPORARY_EXIT", label: "Retour apres sortie temporaire", activeInLot5: false },
  { code: "REGULARIZATION", label: "Regularisation", activeInLot5: false }
];

export const MOVEMENT_TYPES_REQUIRING_DETAILS = [
  "REASSIGNMENT",
  "LOAN_EVENT",
  "RETURN_FROM_LOAN_EVENT",
  "WORKSHOP_REPAIR",
  "RETURN_FROM_WORKSHOP_REPAIR"
];

export const MOVEMENT_STATUSES = [
  { code: "DRAFT", label: "Brouillon" },
  { code: "VALIDATED", label: "Valide" },
  { code: "CANCELLED", label: "Annule" }
];

export function isMovementTypeAllowedInLot5(code) {
  return MOVEMENT_TYPES.some((item) => item.code === code && item.activeInLot5);
}

export function movementRequiresDetails(code) {
  return MOVEMENT_TYPES_REQUIRING_DETAILS.includes(code);
}
