import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [parkPage, park, unitList, unitsApi, entriesApi, pickerPage, picker, itemsApi] = await Promise.all([
  read("app/parc/page.js"),
  read("app/parc/asset-park.js"),
  read("lib/asset-unit-list.js"),
  read("app/api/asset-units/route.js"),
  read("app/api/asset-entries/route.js"),
  read("app/parc/nouvelle-entree/page.js"),
  read("app/parc/nouvelle-entree/entry-article-picker.js"),
  read("app/api/asset-items/route.js")
]);

assert.doesNotMatch(parkPage, /quantitativeStockPosition\.findMany|listEquipmentSets|assetItem\.findMany|supplier\.findMany/, "Le SSR initial ne doit charger ni stocks, ni ensembles, ni articles, ni fournisseurs.");
assert.match(parkPage, /listAssetUnitsPage\(\)/, "Le SSR doit charger une page bornée de biens.");
assert.match(parkPage, /take:\s*8/, "Les entrées récentes doivent être bornées.");
assert.match(parkPage, /quantitativeStocks:\s*null[\s\S]*equipmentSets:\s*null/, "Les collections secondaires doivent démarrer non chargées.");

assert.match(park, /onToggle=.*quantitativeStocks === null.*loadQuantitativeStocks/s, "Les stocks doivent être chargés à l’ouverture.");
assert.match(park, /onToggle=.*equipmentSets === null.*loadEquipmentSets/s, "Les ensembles doivent être chargés à l’ouverture.");
assert.match(park, /Chargement des stocks/);
assert.match(park, /Chargement des ensembles/);
assert.doesNotMatch(park, /useEffect/, "B1 doit continuer à interdire le refresh initial d’AssetPark.");
assert.ok((park.match(/await loadData\(\)/g) || []).length >= 10, "Les refresh après mutation doivent rester présents.");

assert.match(unitList, /DEFAULT_ASSET_UNIT_PAGE_SIZE = 25/);
assert.match(unitList, /MAX_ASSET_UNIT_PAGE_SIZE = 50/);
assert.match(unitList, /skip:\s*\(safePage - 1\) \* safePageSize/);
assert.match(unitList, /take:\s*safePageSize/);
assert.match(unitList, /assetUnit\.count/);
assert.match(unitList, /assetFiles:[\s\S]*take:\s*1/);
assert.match(unitList, /documentLines:[\s\S]*take:\s*1/);
assert.match(unitList, /movementLines:[\s\S]*take:\s*1/);
assert.match(unitsApi, /paginate.*=== "true"/s);
assert.match(unitsApi, /purpose.*=== "equipment"[\s\S]*select:[\s\S]*assetItem:/s, "Les unités nécessaires aux ensembles doivent être chargées sans fichiers, après ouverture.");
assert.match(unitsApi, /const where = \{ deletedAt: null \}/, "Le contrat historique non paginé doit rester disponible.");
assert.match(entriesApi, /Math\.min\(requestedLimit, 50\)/);

assert.doesNotMatch(pickerPage, /assetItem\.findMany/, "Ouvrir le picker ne doit pas charger les ~500 articles en SSR.");
assert.match(picker, /setTimeout\(async \(\) =>/);
assert.match(picker, /}, 250\)/);
assert.match(picker, /picker: "true", limit: "20"/);
assert.match(itemsApi, /Math\.min\(requestedLimit, 50\)/);
assert.match(itemsApi, /take:\s*limit/);
assert.match(itemsApi, /name:[\s\S]*code:[\s\S]*category:/);

console.log("PERFORMANCE-B2 targeted checks passed.");
