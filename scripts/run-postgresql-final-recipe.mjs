import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient as NormalClient } from "../generated/prisma-postgresql/index.js";
import { PrismaClient as RecipeClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const CAMPAIGN = "PG-RECIPE-PHASE8-20260729034635";
const IDS = {
  supplier: "cms5jmm600000v5zwu34a5y0w",
  item: "cms5jnvrr000mv5zwekkg5s5s",
  entry: "cms5jofzg000qv5zw2wfj99wz",
  unit: "cms5jogls000rv5zw49j8a13s",
  location: "cms5jn62k0005v5zw63q3jdhk",
  movement: "cms5k4pgx0001v5ckzffmjdzh",
  document: "cms5p313k0000v5qo7b1vv0y2"
};
const baseUrl = process.env.RECIPE_BASE_URL || "http://127.0.0.1:3018";
const outputDir = path.resolve("outputs/migration/phase8-http-recipe", CAMPAIGN);
const manifest = JSON.parse(await readFile("outputs/migration/sqlite-export/run-1/manifest.json", "utf8"));
const env = await loadSupabaseEnv();
const normalUrl = new URL(env.SUPABASE_DIRECT_URL);
normalUrl.searchParams.set("schema", "immos");
const recipeUrl = new URL(env.SUPABASE_DIRECT_URL);
recipeUrl.searchParams.set("schema", "immos_recipe_phase8");
const normal = new NormalClient({ datasourceUrl: normalUrl.toString(), errorFormat: "minimal" });
const recipe = new RecipeClient({ datasourceUrl: recipeUrl.toString(), errorFormat: "minimal" });
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const events = [];

async function referenceSnapshot() {
  const hashes = {};
  let total = 0;
  for (const table of manifest.tables) {
    const rows = await normal.$queryRawUnsafe(
      `SELECT ${table.columns.map(quote).join(",")} FROM "immos".${quote(table.table)} ORDER BY ${quote(table.primaryKey)}`
    );
    total += rows.length;
    hashes[table.table] = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  }
  return {
    total,
    fingerprint: createHash("sha256").update(JSON.stringify(hashes)).digest("hex")
  };
}

async function recipeIntegrity() {
  const [total] = await recipe.$queryRawUnsafe(`SELECT (${manifest.tables.map((table) =>
    `(SELECT COUNT(*) FROM "immos_recipe_phase8".${quote(table.table)})`
  ).join(" + ")})::int AS total`);
  const [invalid] = await recipe.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS count FROM (
      SELECT 1 FROM "immos_recipe_phase8"."asset_document_entries" de
      LEFT JOIN "immos_recipe_phase8"."asset_documents" d ON d.id=de.document_id
      LEFT JOIN "immos_recipe_phase8"."asset_entries" e ON e.id=de.asset_entry_id
      WHERE d.id IS NULL OR e.id IS NULL
      UNION ALL
      SELECT 1 FROM "immos_recipe_phase8"."asset_document_lines" dl
      LEFT JOIN "immos_recipe_phase8"."asset_documents" d ON d.id=dl.document_id
      LEFT JOIN "immos_recipe_phase8"."asset_units" u ON u.id=dl.asset_unit_id
      WHERE d.id IS NULL OR u.id IS NULL
      UNION ALL
      SELECT 1 FROM "immos_recipe_phase8"."asset_movement_lines" ml
      LEFT JOIN "immos_recipe_phase8"."asset_movements" m ON m.id=ml.movement_id
      LEFT JOIN "immos_recipe_phase8"."asset_units" u ON u.id=ml.asset_unit_id
      WHERE m.id IS NULL OR u.id IS NULL
    ) invalid`);
  return { total: total.total, foreignKeyViolations: invalid.count, assetFiles: await recipe.assetFile.count() };
}

const referenceBefore = await referenceSnapshot();
if (referenceBefore.total !== 222) throw new Error("immos non conforme avant recette.");

async function request(name, method, route, body, expectedStatus) {
  const before = await recipeIntegrity();
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  const after = await recipeIntegrity();
  const reference = await referenceSnapshot();
  const event = {
    name, method, route, expectedStatus, status: response.status,
    durationMs: Math.round(performance.now() - startedAt),
    error: response.ok ? null : String(payload.error || "Erreur HTTP"),
    recipeBefore: before, recipeAfter: after,
    referenceUnchanged: reference.total === referenceBefore.total &&
      reference.fingerprint === referenceBefore.fingerprint
  };
  events.push(event);
  console.log(JSON.stringify(event));
  if (!event.referenceUnchanged || after.foreignKeyViolations !== 0 || after.assetFiles !== 0) {
    throw new Error(`${name}: contrôle permanent non conforme.`);
  }
  if (response.status !== expectedStatus) {
    throw new Error(`${name}: HTTP ${response.status}, attendu ${expectedStatus}: ${event.error}`);
  }
  return payload;
}

async function persist(status, error = null) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "final-recipe-manifest.json"), `${JSON.stringify({
    campaign: CAMPAIGN, status, error, events, referenceBefore, completedAt: new Date().toISOString()
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

try {
  await request("valider-document", "POST", `/api/asset-documents/${IDS.document}/validate`, {}, 200);
  await request("suppression-logique-fournisseur", "DELETE", `/api/suppliers/${IDS.supplier}`, undefined, 200);
  await request("annulation-mouvement-validé-interdite", "POST", `/api/asset-movements/${IDS.movement}/cancel`, {
    reason: `${CAMPAIGN} annulation interdite`
  }, 423);
  await request("validation-ressource-inexistante", "POST", "/api/asset-movements/missing-phase8-movement/validate", {}, 400);
  await request("mouvement-référence-inexistante", "POST", "/api/asset-movements", {
    movementType: "ASSIGNMENT", reason: CAMPAIGN,
    lines: [{ assetUnitId: "missing-phase8-unit", toLocationId: IDS.location }]
  }, 400);
  await request("entrée-date-invalide", "POST", "/api/asset-entries", {
    assetItemId: IDS.item, locationId: IDS.location, quantity: 1,
    entryType: "PURCHASE", entryDate: "date-invalide",
    initialCondition: "NEW", initialStatus: "IN_STOCK"
  }, 400);
  await request("entrée-numéro-série-dupliqué", "POST", "/api/asset-entries", {
    assetItemId: IDS.item, locationId: IDS.location, quantity: 1,
    entryType: "PURCHASE", entryDate: new Date().toISOString(),
    initialCondition: "NEW", initialStatus: "IN_STOCK",
    supplierKnown: false, serialNumber: `${CAMPAIGN}-SERIAL`
  }, 400);
  await request("doublon-document-interdit", "POST", "/api/asset-documents/from-entries", {
    entryIds: [IDS.entry], documentType: "ENTRY_SLIP",
    documentDate: new Date().toISOString(), title: `${CAMPAIGN} Doublon`, notes: CAMPAIGN
  }, 409);
  await persist("SUCCESS");
} catch (error) {
  await persist("FAILED", error.message);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([normal.$disconnect(), recipe.$disconnect()]);
}
