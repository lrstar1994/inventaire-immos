export const POSTGRESQL_RECIPE_PROTECTED_BASELINE = Object.freeze({
  recipeTotal: 253,
  productionTotal: 222,
  recipeAssetUnits: 13,
  recipeAssetFiles: 0,
  productionAssetUnits: 12,
  productionAssetFiles: 0,
  recipeForeignKeyOrphans: 0
});

export function assertPostgreSQLRecipeProtectedBaseline(
  snapshot,
  expected = POSTGRESQL_RECIPE_PROTECTED_BASELINE
) {
  const mismatches = Object.entries(expected)
    .filter(([name, value]) => snapshot?.[name] !== value)
    .map(([name, value]) => `${name}=${value}/${snapshot?.[name] ?? "absent"}`);
  if (mismatches.length) {
    throw new Error(`Prévol recette refusé : état protégé inattendu (${mismatches.join(", ")}).`);
  }
  return Object.freeze({ ...snapshot });
}
