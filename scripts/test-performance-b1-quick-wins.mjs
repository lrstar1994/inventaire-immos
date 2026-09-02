import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [park, parkPage, unitsRoute, unitList, detailRoute] = await Promise.all([
  read("app/parc/asset-park.js"),
  read("app/parc/page.js"),
  read("app/api/asset-units/route.js"),
  read("lib/asset-unit-list.js"),
  read("app/api/asset-units/[id]/route.js")
]);

assert.doesNotMatch(park, /\buseEffect\b/, "AssetPark ne doit plus rafraîchir automatiquement au montage.");
assert.match(park, /async function loadData\(\)/, "Le refresh explicite doit rester disponible.");
assert.ok(
  (park.match(/await loadData\(\)/g) || []).length >= 10,
  "Les refresh post-mutation existants doivent être conservés."
);

assert.match(parkPage, /listAssetUnitsPage\(\)/, "ParkPage doit utiliser la liste bornée optimisée.");
assert.match(unitsRoute, /listAssetUnitsPage\(/, "L’API paginée doit utiliser la liste optimisée.");
for (const [name, source] of [["AssetUnit list helper", unitList]]) {
  assert.match(source, /mimeType:\s*\{\s*startsWith:\s*["']image\/["']\s*\}/, `${name} doit limiter les fichiers aux images.`);
  assert.match(source, /assetFiles:\s*\{[\s\S]*?take:\s*1[\s\S]*?\}/, `${name} doit charger au plus une miniature par unité.`);
}

assert.match(
  detailRoute,
  /assetFiles:\s*\{\s*where:\s*\{\s*deletedAt:\s*null\s*\},\s*orderBy:/,
  "La fiche détaillée doit conserver l'accès à tous ses fichiers propres."
);

console.log("PERFORMANCE-B1 targeted checks passed.");
