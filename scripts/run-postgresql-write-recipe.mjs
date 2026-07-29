import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient as NormalPrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const baseUrl = process.env.RECIPE_BASE_URL || "http://127.0.0.1:3018";
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const campaign = `PG-RECIPE-PHASE8-${stamp}`;
const outputDir = path.resolve("outputs", "migration", "phase8-http-recipe", campaign);
const events = [];
const created = [];
const referenceChecks = [];
const exportRoot = path.resolve("outputs", "migration", "sqlite-export", "run-1");
const exportManifest = JSON.parse(await readFile(path.join(exportRoot, "manifest.json"), "utf8"));
const env = await loadSupabaseEnv();
const normalUrl = new URL(env.SUPABASE_DIRECT_URL);
normalUrl.searchParams.set("schema", "immos");
const referencePrisma = new NormalPrismaClient({ datasourceUrl: normalUrl.toString(), errorFormat: "minimal" });
const quote = (value) => `"${value.replaceAll('"', '""')}"`;

async function referenceSnapshot() {
  const hashes = {};
  let total = 0;
  for (const table of exportManifest.tables) {
    const rows = await referencePrisma.$queryRawUnsafe(
      `SELECT ${table.columns.map(quote).join(",")} FROM "immos".${quote(table.table)} ORDER BY ${quote(table.primaryKey)}`
    );
    total += rows.length;
    hashes[table.table] = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  }
  const campaignHits = await referencePrisma.$queryRawUnsafe(
    `SELECT table_name, hits FROM (
      ${exportManifest.tables.map((table) =>
        `SELECT '${table.table}' AS table_name, COUNT(*)::int AS hits FROM "immos".${quote(table.table)} t WHERE to_jsonb(t)::text LIKE $1`
      ).join(" UNION ALL ")}
    ) q WHERE hits > 0`,
    `%${campaign}%`
  );
  return { total, hashes, campaignHits };
}

const referenceBaseline = await referenceSnapshot();
if (referenceBaseline.total !== 222 || referenceBaseline.campaignHits.length !== 0) {
  throw new Error("Le schéma immos n'est pas dans l'état de référence attendu avant recette.");
}

async function assertReferenceUnchanged(afterEvent) {
  const snapshot = await referenceSnapshot();
  const unchanged = snapshot.total === referenceBaseline.total &&
    JSON.stringify(snapshot.hashes) === JSON.stringify(referenceBaseline.hashes) &&
    snapshot.campaignHits.length === 0;
  referenceChecks.push({ afterEvent, total: snapshot.total, campaignHits: snapshot.campaignHits.length, unchanged });
  console.log(`contrôle-immos après ${afterEvent}: ${unchanged ? "INCHANGÉ" : "MODIFIÉ"}`);
  if (!unchanged) throw new Error(`INCIDENT: le schéma immos a changé après ${afterEvent}.`);
}

function safeBody(body) {
  if (!body || typeof body !== "object") return body;
  const clone = structuredClone(body);
  for (const key of ["password", "passwordHash", "token", "authorization"]) {
    if (key in clone) clone[key] = "[REDACTED]";
  }
  return clone;
}

async function request(name, method, route, body, expectedStatus) {
  const startedAt = new Date().toISOString();
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const responseBody = await response.json().catch(() => ({}));
  const event = {
    name,
    route,
    method,
    startedAt,
    status: response.status,
    expectedStatus,
    success: response.status === expectedStatus,
    error: response.ok ? null : String(responseBody.error || "Erreur HTTP sans message")
  };
  events.push(event);
  console.log(`${name}: ${method} ${route} -> ${response.status}`);
  if (["POST", "PATCH", "DELETE"].includes(method)) {
    await assertReferenceUnchanged(name);
  }
  if (response.status !== expectedStatus) {
    throw new Error(`${name}: HTTP ${response.status}, attendu ${expectedStatus}: ${event.error || "réponse inattendue"}`);
  }
  return responseBody;
}

function remember(table, item, route, action, finalState) {
  created.push({ campaign, table, id: item.id, route, action, finalState });
  return item;
}

async function persist(status, error = null) {
  await mkdir(outputDir, { recursive: true });
  const manifest = {
    campaign,
    schema: "immos_recipe_phase8",
    startedAt: events[0]?.startedAt || new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status,
    error,
    events,
    created,
    referenceChecks,
    referenceBaseline
  };
  await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  console.log(`Campagne: ${campaign}`);
  console.log(`Manifeste: ${path.join(outputDir, "manifest.json")}`);
}

try {
  await request("lecture-préalable-fournisseurs", "GET", "/api/suppliers", undefined, 200);

  const supplier = remember(
    "suppliers",
    (await request("créer-fournisseur", "POST", "/api/suppliers", {
      name: `${campaign} Fournisseur`,
      code: `${campaign}-SUP`,
      supplierType: "RECETTE",
      notes: `${campaign} création`
    }, 201)).item,
    "/api/suppliers",
    "create",
    "soft-deleted"
  );
  await request("modifier-fournisseur", "PATCH", `/api/suppliers/${supplier.id}`, {
    contactName: `${campaign} Contact`,
    notes: `${campaign} modification`
  }, 200);

  const rootLocation = remember(
    "locations",
    (await request("créer-emplacement-racine", "POST", "/api/locations", {
      name: `${campaign} Emplacement racine`,
      code: `${campaign}-LOC-R`,
      locationType: "RECETTE",
      notes: campaign
    }, 201)).item,
    "/api/locations",
    "create",
    "active"
  );
  const childLocation = remember(
    "locations",
    (await request("créer-emplacement-enfant", "POST", "/api/locations", {
      name: `${campaign} Emplacement enfant`,
      code: `${campaign}-LOC-E`,
      locationType: "RECETTE",
      parentId: rootLocation.id,
      notes: campaign
    }, 201)).item,
    "/api/locations",
    "create",
    "active"
  );
  await request("modifier-emplacement-enfant", "PATCH", `/api/locations/${childLocation.id}`, {
    notes: `${campaign} emplacement modifié`
  }, 200);

  const rootCategory = remember(
    "asset_categories",
    (await request("créer-catégorie-racine", "POST", "/api/asset-categories", {
      name: `${campaign} Catégorie racine`,
      code: `${campaign}-CAT-R`,
      description: campaign
    }, 201)).item,
    "/api/asset-categories",
    "create",
    "active"
  );
  const childCategory = remember(
    "asset_categories",
    (await request("créer-sous-catégorie", "POST", "/api/asset-categories", {
      name: `${campaign} Sous-catégorie`,
      code: `${campaign}-CAT-E`,
      parentId: rootCategory.id,
      description: campaign
    }, 201)).item,
    "/api/asset-categories",
    "create",
    "active"
  );

  const item = remember(
    "asset_items",
    (await request("créer-article", "POST", "/api/asset-items", {
      name: `${campaign} Article`,
      code: `${campaign}-ITEM`,
      description: campaign,
      unitLabel: "unité",
      categoryId: childCategory.id,
      supplierId: supplier.id
    }, 201)).item,
    "/api/asset-items",
    "create",
    "active"
  );

  await request("négatif-champ-obligatoire", "POST", "/api/suppliers", {
    code: `${campaign}-NO-NAME`
  }, 400);
  await request("négatif-enum-entrée", "POST", "/api/asset-entries", {
    assetItemId: item.id,
    locationId: childLocation.id,
    quantity: 1,
    entryType: "INVALID_ENUM",
    entryDate: new Date().toISOString(),
    initialCondition: "NEW",
    initialStatus: "IN_STOCK"
  }, 400);
  await request("rollback-transaction-entrée-quantité", "POST", "/api/asset-entries", {
    assetItemId: item.id,
    locationId: childLocation.id,
    quantity: 0,
    entryType: "PURCHASE",
    entryDate: new Date().toISOString(),
    initialCondition: "NEW",
    initialStatus: "IN_STOCK",
    notes: `${campaign} rollback volontaire`
  }, 400);

  const entryResponse = await request("créer-entrée-et-unité", "POST", "/api/asset-entries", {
    assetItemId: item.id,
    locationId: childLocation.id,
    supplierId: supplier.id,
    quantity: 1,
    entryType: "PURCHASE",
    entryDate: new Date().toISOString(),
    initialCondition: "NEW",
    initialStatus: "IN_STOCK",
    entryStatus: "VALIDATED",
    informationStatus: "COMPLETE",
    supplierKnown: true,
    unitPrice: 125000,
    priceKnown: true,
    purchaseDateKnown: true,
    purchaseDate: new Date().toISOString(),
    notes: campaign,
    serialNumber: `${campaign}-SERIAL`
  }, 201);
  const entry = remember("asset_entries", entryResponse.entry, "/api/asset-entries", "create", "validated");
  const unit = remember("asset_units", entryResponse.units[0], "/api/asset-entries", "create", "moved");
  await request("modifier-unité", "PATCH", `/api/asset-units/${unit.id}`, {
    condition: "VERY_GOOD",
    informationStatus: "COMPLETE",
    notes: `${campaign} unité modifiée`
  }, 200);
  await request("négatif-enum-unité", "PATCH", `/api/asset-units/${unit.id}`, {
    condition: "INVALID_ENUM"
  }, 400);

  await request("négatif-mouvement-sans-ligne", "POST", "/api/asset-movements", {
    movementType: "ASSIGNMENT",
    reason: campaign,
    lines: []
  }, 400);
  const movement = remember(
    "asset_movements",
    (await request("créer-mouvement", "POST", "/api/asset-movements", {
      movementType: "ASSIGNMENT",
      movementDate: new Date().toISOString(),
      reason: `${campaign} affectation`,
      notes: campaign,
      lines: [{
        assetUnitId: unit.id,
        toLocationId: rootLocation.id,
        lineNotes: campaign
      }]
    }, 201)).movement,
    "/api/asset-movements",
    "create",
    "validated"
  );
  for (const line of movement.lines) {
    remember("asset_movement_lines", line, "/api/asset-movements", "create", "active");
  }
  await request("valider-mouvement", "POST", `/api/asset-movements/${movement.id}/validate`, {}, 200);
  await request("négatif-annuler-mouvement-validé", "POST", `/api/asset-movements/${movement.id}/cancel`, {
    reason: `${campaign} annulation interdite`
  }, 423);

  const document = remember(
    "asset_documents",
    (await request("créer-document-depuis-entrée", "POST", "/api/asset-documents/from-entries", {
      entryIds: [entry.id],
      documentType: "ENTRY_SLIP",
      documentDate: new Date().toISOString(),
      title: `${campaign} Bon entrée`,
      notes: campaign
    }, 201)).document,
    "/api/asset-documents/from-entries",
    "create",
    "validated"
  );
  for (const link of document.entries) {
    remember("asset_document_entries", link, "/api/asset-documents/from-entries", "create", "active");
  }
  for (const line of document.lines) {
    remember("asset_document_lines", line, "/api/asset-documents/from-entries", "create", "active");
  }
  await request("valider-document", "POST", `/api/asset-documents/${document.id}/validate`, {}, 200);
  await request("négatif-document-en-doublon", "POST", "/api/asset-documents/from-entries", {
    entryIds: [entry.id],
    documentType: "ENTRY_SLIP",
    documentDate: new Date().toISOString(),
    title: `${campaign} Doublon interdit`,
    notes: campaign
  }, 409);

  await request("suppression-logique-fournisseur", "DELETE", `/api/suppliers/${supplier.id}`, undefined, 200);
  await request("lecture-finale-mouvement", "GET", `/api/asset-movements/${movement.id}`, undefined, 200);
  await request("lecture-finale-document", "GET", `/api/asset-documents/${document.id}`, undefined, 200);
  await request("lecture-finale-unité", "GET", `/api/asset-units/${unit.id}`, undefined, 200);

  await persist("SUCCESS");
} catch (error) {
  await persist("FAILED", error.message);
  process.exitCode = 1;
} finally {
  await referencePrisma.$disconnect();
}
