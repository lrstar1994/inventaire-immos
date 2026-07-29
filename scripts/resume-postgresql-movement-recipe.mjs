import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient as NormalPrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const CAMPAIGN = "PG-RECIPE-PHASE8-20260729034635";
const IDS = {
  rootLocation: "cms5jn62k0005v5zw63q3jdhk",
  childLocation: "cms5jnaj40009v5zwxz50blnq",
  item: "cms5jnvrr000mv5zwekkg5s5s",
  entry: "cms5jofzg000qv5zw2wfj99wz",
  unit: "cms5jogls000rv5zw49j8a13s"
};
const baseUrl = process.env.RECIPE_BASE_URL || "http://127.0.0.1:3018";
const outputDir = path.resolve("outputs", "migration", "phase8-http-recipe", CAMPAIGN);
const events = [];
const created = [];
const referenceChecks = [];
const exportRoot = path.resolve("outputs", "migration", "sqlite-export", "run-1");
const manifest = JSON.parse(await readFile(path.join(exportRoot, "manifest.json"), "utf8"));
const env = await loadSupabaseEnv();
const normalUrl = new URL(env.SUPABASE_DIRECT_URL);
normalUrl.searchParams.set("schema", "immos");
const normal = new NormalPrismaClient({ datasourceUrl: normalUrl.toString(), errorFormat: "minimal" });
const quote = (value) => `"${value.replaceAll('"', '""')}"`;

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
  const [hits] = await normal.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM (
      ${manifest.tables.map((table) =>
        `SELECT 1 FROM "immos".${quote(table.table)} t WHERE to_jsonb(t)::text LIKE $1`
      ).join(" UNION ALL ")}
    ) q`,
    `%${CAMPAIGN}%`
  );
  return { total, hashes, campaignHits: hits.count };
}

const baseline = await referenceSnapshot();
if (baseline.total !== 222 || baseline.campaignHits !== 0) throw new Error("immos n'est pas conforme avant reprise.");

async function assertReferenceUnchanged(afterEvent) {
  const current = await referenceSnapshot();
  const unchanged = current.total === 222 && current.campaignHits === 0 &&
    JSON.stringify(current.hashes) === JSON.stringify(baseline.hashes);
  referenceChecks.push({ afterEvent, total: current.total, campaignHits: current.campaignHits, unchanged });
  console.log(`contrôle-immos après ${afterEvent}: ${unchanged ? "INCHANGÉ" : "MODIFIÉ"}`);
  if (!unchanged) throw new Error(`INCIDENT: immos modifié après ${afterEvent}.`);
}

async function request(name, method, route, body, expectedStatus) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  const event = {
    name, method, route, expectedStatus, status: response.status,
    durationMs: Math.round(performance.now() - started),
    error: response.ok ? null : String(result.error || "Erreur HTTP sans message")
  };
  events.push(event);
  console.log(`${name}: ${method} ${route} -> ${response.status} (${event.durationMs} ms)`);
  if (["POST", "PATCH", "DELETE"].includes(method)) await assertReferenceUnchanged(name);
  if (response.status !== expectedStatus) {
    throw new Error(`${name}: HTTP ${response.status}, attendu ${expectedStatus}: ${event.error}`);
  }
  return result;
}

async function persist(status, error = null) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "movement-resume-manifest.json"), `${JSON.stringify({
    campaign: CAMPAIGN,
    schema: "immos_recipe_phase8",
    status,
    error,
    completedAt: new Date().toISOString(),
    events,
    created,
    referenceChecks,
    referenceBaseline: baseline
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

try {
  await request("santé-reprise", "GET", "/api/health", undefined, 200);
  await request("lecture-unité-contexte", "GET", `/api/asset-units/${IDS.unit}`, undefined, 200);

  const movementResult = await request("créer-mouvement-tentative-unique", "POST", "/api/asset-movements", {
    movementType: "ASSIGNMENT",
    movementDate: new Date().toISOString(),
    reason: `${CAMPAIGN} affectation`,
    notes: CAMPAIGN,
    lines: [{ assetUnitId: IDS.unit, toLocationId: IDS.rootLocation, lineNotes: CAMPAIGN }]
  }, 201);
  const movement = movementResult.movement;
  created.push({ table: "asset_movements", id: movement.id, route: "/api/asset-movements" });
  for (const line of movement.lines) {
    created.push({ table: "asset_movement_lines", id: line.id, route: "/api/asset-movements" });
  }

  await request("valider-mouvement", "POST", `/api/asset-movements/${movement.id}/validate`, {}, 200);
  await request("transition-interdite-annulation-mouvement-validé", "POST", `/api/asset-movements/${movement.id}/cancel`, {
    reason: `${CAMPAIGN} annulation interdite`
  }, 423);

  const documentResult = await request("créer-document", "POST", "/api/asset-documents/from-entries", {
    entryIds: [IDS.entry],
    documentType: "ENTRY_SLIP",
    documentDate: new Date().toISOString(),
    title: `${CAMPAIGN} Bon entrée`,
    notes: CAMPAIGN
  }, 201);
  const document = documentResult.document;
  created.push({ table: "asset_documents", id: document.id, route: "/api/asset-documents/from-entries" });
  for (const link of document.entries) created.push({ table: "asset_document_entries", id: link.id, route: "/api/asset-documents/from-entries" });
  for (const line of document.lines) created.push({ table: "asset_document_lines", id: line.id, route: "/api/asset-documents/from-entries" });

  await request("valider-document", "POST", `/api/asset-documents/${document.id}/validate`, {}, 200);
  await request("doublon-document-interdit", "POST", "/api/asset-documents/from-entries", {
    entryIds: [IDS.entry],
    documentType: "ENTRY_SLIP",
    documentDate: new Date().toISOString(),
    title: `${CAMPAIGN} Doublon`,
    notes: CAMPAIGN
  }, 409);
  await request("référence-inexistante-mouvement", "POST", "/api/asset-movements", {
    movementType: "ASSIGNMENT",
    reason: CAMPAIGN,
    lines: [{ assetUnitId: "missing-phase8-unit", toLocationId: IDS.rootLocation }]
  }, 400);
  await request("date-invalide-entrée", "POST", "/api/asset-entries", {
    assetItemId: IDS.item,
    locationId: IDS.childLocation,
    quantity: 1,
    entryType: "PURCHASE",
    entryDate: "date-invalide",
    initialCondition: "NEW",
    initialStatus: "IN_STOCK"
  }, 400);

  await persist("SUCCESS");
} catch (error) {
  await persist("FAILED", error.message);
  process.exitCode = 1;
} finally {
  await normal.$disconnect();
}
