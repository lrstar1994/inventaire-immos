export const USER_ROLES = {
  DIRECTION: "DIRECTION",
  INVENTORY_MANAGER: "INVENTORY_MANAGER",
  MAINTENANCE_MANAGER: "MAINTENANCE_MANAGER",
  BASIC_USER: "BASIC_USER"
};

export const ROLE_LABELS = {
  DIRECTION: "Direction",
  INVENTORY_MANAGER: "Responsable inventaire",
  MAINTENANCE_MANAGER: "Responsable maintenance",
  BASIC_USER: "Utilisateur simple"
};

export function canManageUsers(role) {
  return role === USER_ROLES.DIRECTION;
}

export function canValidateFinalExit(role) {
  return role === USER_ROLES.DIRECTION || role === USER_ROLES.INVENTORY_MANAGER;
}

export function canManageReferentials(role) {
  return role === USER_ROLES.DIRECTION || role === USER_ROLES.INVENTORY_MANAGER;
}

export function canManageAssets(role) {
  return role === USER_ROLES.DIRECTION || role === USER_ROLES.INVENTORY_MANAGER;
}

export function canManageAssetDocuments(role) {
  return role === USER_ROLES.DIRECTION || role === USER_ROLES.INVENTORY_MANAGER;
}

export function canCreateMovementDraft(role) {
  return role === USER_ROLES.DIRECTION || role === USER_ROLES.INVENTORY_MANAGER || role === USER_ROLES.MAINTENANCE_MANAGER;
}

export function canManageMovements(role) {
  return role === USER_ROLES.DIRECTION || role === USER_ROLES.INVENTORY_MANAGER;
}

export function canManageAssetFiles(role) {
  return role === USER_ROLES.DIRECTION || role === USER_ROLES.INVENTORY_MANAGER;
}

export function canUploadAssetFiles(role) {
  return canManageAssetFiles(role) || role === USER_ROLES.MAINTENANCE_MANAGER;
}
