import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const park = await readFile(new URL("../app/parc/asset-park.js", import.meta.url), "utf8");
const detail = await readFile(new URL("../app/parc/[id]/asset-unit-detail.js", import.meta.url), "utf8");
const unitRoute = await readFile(new URL("../app/api/asset-units/[id]/route.js", import.meta.url), "utf8");
const feedback = await readFile(new URL("../app/components/action-feedback.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("la confirmation d'entrée ouvre directement la zone fichiers", () => {
  assert.match(park, /Ajouter des photos \/ pièces jointes/);
  assert.match(park, /openEntryFiles\(createdEntryContext\)/);
  assert.match(feedback, /value\.actions \|\| \(value\.action \? \[value\.action\] : \[\]\)/);
});

test("photos et justificatifs sont envoyés séparément et acceptent plusieurs fichiers", () => {
  assert.match(park, /uploadEntryFiles\(event, "MATERIAL_PHOTO"\)/);
  assert.match(park, /uploadEntryFiles\(event, "SUPPORTING_DOCUMENT"\)/);
  assert.match(park, /required multiple accept="image\/\*"/);
  assert.match(park, /required multiple accept="image\/\*,\.pdf"/);
  assert.match(park, /Photos du matériel/);
  assert.match(park, /Documents justificatifs/);
});

test("la galerie se rafraîchit après upload, photo principale et suppression", () => {
  assert.match(park, /await loadEntryFiles\(\)/g);
  assert.match(park, /body: JSON\.stringify\(\{ isPrimary: true \}\)/);
  assert.match(park, /method: "DELETE"/);
  assert.match(park, /entryFiles\.filter\(\(file\) => file\.fileKind === "MATERIAL_PHOTO"\)/);
});

test("les écritures de fichiers restent masquées en lecture seule", () => {
  assert.match(park, /\{canWrite \? <form className="form asset-upload-card"/);
  assert.match(park, /\{canWrite \? <div className="form-actions">/);
});

test("le fallback d'entrée est limité au mode I quantité 1 sans photo propre", () => {
  assert.match(detail, /trackingMode !== "I" \|\| unit\?\.entry\?\.quantity !== 1/);
  assert.match(detail, /unit\?\.assetFiles\?\.some\(\(file\) => file\.isPrimary\)/);
  assert.match(detail, /Photo d’entrée/);
  assert.match(unitRoute, /fileKind: "MATERIAL_PHOTO", isPrimary: true/);
  assert.doesNotMatch(detail, /POST.*asset-entries.*files/s);
});

test("la galerie mobile utilise une seule colonne", () => {
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.entry-files-grid \{\s*grid-template-columns: 1fr;/);
});
