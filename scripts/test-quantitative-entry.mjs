import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const service = await readFile(new URL("../lib/asset-service.js", import.meta.url), "utf8");
const referenceFoundation = await readFile(new URL("../lib/asset-reference-foundation.js", import.meta.url), "utf8");
const documents = await readFile(new URL("../lib/document-service.js", import.meta.url), "utf8");
const park = await readFile(new URL("../app/parc/asset-park.js", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/quantitative-stock-positions/route.js", import.meta.url), "utf8");

test("13C-D: le flux Q crée atomiquement une entrée et une position, sans AssetUnit", () => {
  assert.match(service, /createQuantitativeAssetEntryWithPosition/);
  assert.match(service, /assetEntryId: entry\.id, locationId: entry\.locationId, availableQuantity: quantity/);
  assert.match(service, /units: \[\], duplicateWarning: null, trackingMode/);
  assert.match(service, /prismaClient\.\$transaction/);
});

test("13C-D/F: Q et QI exigent une quantité entière positive et E reste protégé", () => {
  assert.match(service, /\^\[1-9\]\\d\*\$/);
  assert.match(service, /assertQuantitativeTrackingMode/);
  assert.match(referenceFoundation, /TRACKING_MODE_NOT_OPERATIONAL/);
  assert.match(park, /trackingMode === "E"/);
});

test("13C-D: les documents Q produisent une seule ligne de quantité", () => {
  assert.match(documents, /\["Q", "QI"\]\.includes/);
  assert.match(documents, /quantity: entry\.quantity/);
  assert.match(documents, /assetEntryId: entry\.id/);
  assert.match(documents, /continue;/);
});

test("13C-D: la consultation des stocks quantitatifs reste distincte des unités", () => {
  assert.match(route, /quantitativeStockPosition\.findMany/);
  assert.match(park, /Stocks quantitatifs/);
  assert.match(park, /Aucun stock quantitatif enregistré/);
});
