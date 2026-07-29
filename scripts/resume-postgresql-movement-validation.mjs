import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient as NormalPrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const CAMPAIGN = "PG-RECIPE-PHASE8-20260729034635";
const MOVEMENT_ID = "cms5k4pgx0001v5ckzffmjdzh";
const ENTRY_ID = "cms5jofzg000qv5zw2wfj99wz";
const UNIT_ID = "cms5jogls000rv5zw49j8a13s";
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
if (baseline.total !== 222 || baseline.campaignHits !== 0) throw new Error("immos non conforme avant validation.");

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
  if (response.status !== expectedStatus) throw new Error(`${name}: HTTP ${response.status}, attendu ${expectedStatus}: ${event.error}`);
  return result;
}

async function persist(status, error = null) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "movement-validation-manifest.json"), `${JSON.stringify({
    campaign: CAMPAIGN, schema: "immos_recipe_phase8", status, error,
    completedAt: new Date().toISOString(), events, created, referenceChecks,
    referenceBaseline: baseline
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

try {
  await request("santé-validation", "GET", "/api/health", undefined, 200);
  await request("lecture-mouvement-draft", "GET", `/api/asset-movements/${MOVEMENT_ID}`, undefined, 200);

  await request("valider-mouvement-tentative-unique", "POST", `/api/asset-movements/${MOVEMENT_ID}/validate`, {}, 200);
  await request("valider-seconde-fois-idempotent", "POST", `/api/asset-movements/${MOVEMENT_ID}/validate`, {}, 200);
  await request("valider-mouvement-inexistant", "POST", "/api/asset-movements/missing-phase8-movement/validate", {}, 400);
  await request("annulation-mouvement-validé-interdite", "POST", `/api/asset-movements/${MOVEMENT_ID}/cancel`, {
    reason: `${CAMPAIGN} annulation interdite`
  }, 423);

  const documentResult = await request("créer-document", "POST", "/api/asset-documents/from-entries", {
    entryIds: [ENTRY_ID],
    documentType: "ENTRY_SLIP",
    documentDate: new Date().toISOString(),
    title: `${CAMPAIGN} Bon entrée`,
    notes: CAMPAIGN
  }, 201);
  const document = documentResult.document;
  created.push({ table: "asset_documents", id: document.id });
  for (const link of document.entries) created.push({ table: "asset_document_entries", documentId: link.documentId, assetEntryId: link.assetEntryId });
  for (const line of document.lines) created.push({ table: "asset_document_lines", id: line.id });
  await request("valider-document", "POST", `/api/asset-documents/${document.id}/validate`, {}, 200);
  await request("doublon-document-interdit", "POST", "/api/asset-documents/from-entries", {
    entryIds: [ENTRY_ID],
    documentType: "ENTRY_SLIP",
    documentDate: new Date().toISOString(),
    title: `${CAMPAIGN} Doublon`,
    notes: CAMPAIGN
  }, 409);
  await request("lecture-unité-après-validation", "GET", `/api/asset-units/${UNIT_ID}`, undefined, 200);

  await persist("SUCCESS");
} catch (error) {
  await persist("FAILED", error.message);
  process.exitCode = 1;
} finally {
  await normal.$disconnect();
}
