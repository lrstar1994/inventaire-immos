export const CATEGORY_LEVELS = Object.freeze(["CATEGORY", "SUBCATEGORY", "FAMILY"]);
export const TRACKING_MODES = Object.freeze(["I", "Q", "QI", "E"]);
export const CONTROL_LEVELS = Object.freeze(["C1", "C2", "C3", "C4"]);

export const CATEGORY_LEVEL_LABELS = Object.freeze({
  CATEGORY: "Catégorie",
  SUBCATEGORY: "Sous-catégorie",
  FAMILY: "Famille"
});

export const TRACKING_MODE_LABELS = Object.freeze({
  I: "Individuel",
  Q: "Quantité",
  QI: "Quantité individualisable",
  E: "Ensemble"
});

export const CONTROL_LEVEL_LABELS = Object.freeze({
  C1: "Standard",
  C2: "À contrôler",
  C3: "Sensible",
  C4: "Critique"
});

const CODE_PREFIXES = Object.freeze({
  CATEGORY: "CAT-",
  SUBCATEGORY: "SCT-",
  FAMILY: "FAM-"
});

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function value(value) {
  return String(value ?? "").trim();
}

function assertEnum(candidate, allowed, label) {
  if (!allowed.includes(candidate)) fail(`${label} invalide.`);
}

export function assertNewCategoryCode(code, hierarchyLevel) {
  const normalized = value(code).toUpperCase();
  if (!normalized) fail("Le code est obligatoire pour un nouveau niveau de référentiel.");
  if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(normalized) || normalized.length > 40) {
    fail("Le code doit être stable, en majuscules, et composé de segments alphanumériques séparés par des tirets.");
  }
  if (!normalized.startsWith(CODE_PREFIXES[hierarchyLevel])) {
    fail(`Le code ${hierarchyLevel} doit commencer par ${CODE_PREFIXES[hierarchyLevel]}.`);
  }
  return normalized;
}

async function assertNoCycle(prismaClient, currentId, parentId) {
  if (!currentId || !parentId) return;
  const visited = new Set();
  let cursor = parentId;
  while (cursor) {
    if (cursor === currentId) fail("Cycle hiérarchique interdit.");
    if (visited.has(cursor)) fail("Hiérarchie existante cyclique ou incohérente.");
    visited.add(cursor);
    const category = await prismaClient.assetCategory.findUnique({
      where: { id: cursor },
      select: { parentId: true }
    });
    cursor = category?.parentId || null;
  }
}

export async function validateAssetCategoryMutation({ prismaClient, body, id = null }) {
  const current = id
    ? await prismaClient.assetCategory.findFirst({ where: { id, deletedAt: null } })
    : null;
  if (id && !current) fail("Catégorie introuvable.", 404);

  const hierarchyLevel = value(body.hierarchyLevel !== undefined ? body.hierarchyLevel : (current?.hierarchyLevel ?? "CATEGORY"));
  assertEnum(hierarchyLevel, CATEGORY_LEVELS, "Niveau hiérarchique");
  const parentId = value(body.parentId !== undefined ? body.parentId : current?.parentId) || null;
  const trackingMode = value(body.trackingMode !== undefined ? body.trackingMode : current?.trackingMode) || null;
  const controlLevel = value(body.controlLevel !== undefined ? body.controlLevel : current?.controlLevel) || null;
  const codeInput = body.code === undefined ? current?.code : body.code;
  const code = id && value(codeInput) === value(current?.code)
    ? current.code
    : assertNewCategoryCode(codeInput, hierarchyLevel);

  let parent = null;
  if (parentId) {
    parent = await prismaClient.assetCategory.findFirst({
      where: { id: parentId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, hierarchyLevel: true, status: true }
    });
    if (!parent) fail("Parent actif introuvable.");
  }

  if (hierarchyLevel === "CATEGORY") {
    if (parentId) fail("Une catégorie racine ne peut pas avoir de parent.");
  } else if (hierarchyLevel === "SUBCATEGORY") {
    if (!parent || parent.hierarchyLevel !== "CATEGORY") {
      fail("Une sous-catégorie doit avoir une catégorie comme parent.");
    }
  } else if (!parent || parent.hierarchyLevel !== "SUBCATEGORY") {
    fail("Une famille doit avoir une sous-catégorie comme parent.");
  }

  if (hierarchyLevel === "FAMILY") {
    assertEnum(trackingMode, TRACKING_MODES, "Mode de suivi");
    assertEnum(controlLevel, CONTROL_LEVELS, "Niveau de contrôle");
  } else if (trackingMode || controlLevel) {
    fail("Le mode de suivi et le niveau de contrôle sont réservés aux familles.");
  }

  await assertNoCycle(prismaClient, id, parentId);

  if (current && hierarchyLevel !== current.hierarchyLevel) {
    const [children, linkedItems] = await Promise.all([
      prismaClient.assetCategory.count({ where: { parentId: id, deletedAt: null } }),
      prismaClient.assetItem.count({ where: { categoryId: id, deletedAt: null } })
    ]);
    if (children > 0 || linkedItems > 0) {
      fail("Le niveau d'une catégorie utilisée ou possédant des enfants ne peut pas être modifié.", 409);
    }
  }

  return {
    hierarchyLevel,
    parentId,
    trackingMode: hierarchyLevel === "FAMILY" ? trackingMode : null,
    controlLevel: hierarchyLevel === "FAMILY" ? controlLevel : null,
    code
  };
}

export async function validateAssetItemFamily({ prismaClient, body, id = null }) {
  const current = id
    ? await prismaClient.assetItem.findFirst({ where: { id, deletedAt: null }, select: { categoryId: true } })
    : null;
  if (id && !current) fail("Référence matériel introuvable.", 404);
  const categoryId = value(body.categoryId ?? current?.categoryId);
  if (!categoryId) fail("Une famille est obligatoire pour la référence matériel.");
  const family = await prismaClient.assetCategory.findFirst({
    where: { id: categoryId, deletedAt: null, status: "ACTIVE" },
    select: { id: true, hierarchyLevel: true, trackingMode: true, controlLevel: true }
  });
  if (!family || family.hierarchyLevel !== "FAMILY") {
    fail("Une nouvelle référence matériel doit être liée à une famille active.");
  }
  return { categoryId };
}

export function assertIndividualTrackingMode(assetItem) {
  const mode = assetItem?.category?.trackingMode || "I";
  if (mode !== "I") {
    const error = new Error(
      `Le mode ${mode} sera disponible après activation de la gestion quantitative. Aucune unité individuelle n'a été créée.`
    );
    error.code = "TRACKING_MODE_NOT_OPERATIONAL";
    error.status = 409;
    throw error;
  }
  return mode;
}
