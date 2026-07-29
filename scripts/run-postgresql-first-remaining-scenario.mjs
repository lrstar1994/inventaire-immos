import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const CAMPAIGN = "PG-RECIPE-PHASE8-20260729034635";
const ENTRY_ID = "cms5jofzg000qv5zw2wfj99wz";
const baseUrl = process.env.RECIPE_BASE_URL || "http://127.0.0.1:3018";
const exportRoot = path.resolve("outputs", "migration", "sqlite-export", "run-1");
const manifest = JSON.parse(await readFile(path.join(exportRoot, "manifest.json"), "utf8"));
const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
url.searchParams.set("schema", "immos");
const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });
const quote = (value) => `"${value.replaceAll('"', '""')}"`;

async function referenceSnapshot() {
  const hashes = {};
  let total = 0;
  for (const table of manifest.tables) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT ${table.columns.map(quote).join(",")} FROM "immos".${quote(table.table)} ORDER BY ${quote(table.primaryKey)}`
    );
    total += rows.length;
    hashes[table.table] = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  }
  return {
    total,
    aggregateFingerprint: createHash("sha256").update(JSON.stringify(hashes)).digest("hex")
  };
}

const before = await referenceSnapshot();
if (before.total !== 222) throw new Error("immos non conforme avant le scénario.");
const started = performance.now();
let event;
let responseBody = {};
try {
  const response = await fetch(`${baseUrl}/api/asset-documents/from-entries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entryIds: [ENTRY_ID],
      documentType: "ENTRY_SLIP",
      documentDate: new Date().toISOString(),
      title: `${CAMPAIGN} Bon entrée`,
      notes: CAMPAIGN
    })
  });
  responseBody = await response.json().catch(() => ({}));
  event = {
    scenario: "Créer un document ENTRY_SLIP depuis l'entrée de campagne",
    route: "/api/asset-documents/from-entries",
    method: "POST",
    expectedStatus: 201,
    status: response.status,
    durationMs: Math.round(performance.now() - started),
    documentId: responseBody.document?.id || null,
    documentEntryCount: responseBody.document?.entries?.length || 0,
    documentLineCount: responseBody.document?.lines?.length || 0,
    error: response.ok ? null : String(responseBody.error || "Erreur HTTP sans message")
  };
  const after = await referenceSnapshot();
  const referenceUnchanged = after.total === before.total &&
    after.aggregateFingerprint === before.aggregateFingerprint;
  const output = {
    campaign: CAMPAIGN,
    schema: "immos_recipe_phase8",
    event,
    immosBefore: before,
    immosAfter: after,
    referenceUnchanged
  };
  const outputDir = path.resolve("outputs", "migration", "phase8-http-recipe", CAMPAIGN);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "first-remaining-scenario.json"), `${JSON.stringify(output, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  console.log(JSON.stringify(output, null, 2));
  if (!referenceUnchanged) throw new Error("INCIDENT: immos a changé.");
  if (response.status !== 201) throw new Error(`Scénario HTTP ${response.status}: ${event.error}`);
} finally {
  await prisma.$disconnect();
}
