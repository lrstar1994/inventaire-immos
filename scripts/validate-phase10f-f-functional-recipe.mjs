import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createServerClient } from "@supabase/ssr";
import { PrismaClient as ProductionPrismaClient } from "../generated/prisma-postgresql/index.js";
import { PrismaClient as RecipePrismaClient } from "../generated/prisma-recipe/index.js";

import { executeRecipeAuthLink } from "./manage-recipe-auth-link.mjs";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const BASE_URL = "http://127.0.0.1:3000";
const RECIPE_SCHEMA = "immos_recipe_phase8";
const PRODUCTION_SCHEMA = "immos";
const SQLITE_SHA256 = "9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed";
const TABLES = [
  "users", "suppliers", "locations", "asset_categories", "asset_items",
  "asset_entries", "asset_units", "asset_files", "asset_movements",
  "asset_movement_lines", "asset_documents", "asset_document_entries",
  "asset_document_lines", "sensitive_action_approvals", "audit_logs"
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function cookieJarClient(env) {
  const jar = new Map();
  const client = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll(values) {
          for (const { name, value } of values) {
            if (value) jar.set(name, value);
            else jar.delete(name);
          }
        }
      }
    }
  );
  return {
    client,
    header: () => [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
    count: () => jar.size
  };
}

async function request(pathname, cookie = "", options = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${BASE_URL}${pathname}`, {
    redirect: "manual",
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(cookie ? { cookie } : {})
    }
  });
  const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10;
  return { response, elapsedMs };
}

async function jsonRequest(pathname, cookie, options = {}) {
  const { response, elapsedMs } = await request(pathname, cookie, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { nonJson: true };
  }
  return { status: response.status, body, elapsedMs, location: response.headers.get("location") };
}

async function jsonMutation(pathname, cookie, method, body) {
  return jsonRequest(pathname, cookie, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function counts(prisma, schema) {
  const [row] = await prisma.$queryRawUnsafe(`
    SELECT
      (${TABLES.map((table) => `(SELECT COUNT(*) FROM "${schema}"."${table}")`).join(" + ")})::int total,
      (SELECT COUNT(*)::int FROM "${schema}"."asset_units") asset_units,
      (SELECT COUNT(*)::int FROM "${schema}"."asset_files") asset_files
  `);
  return row;
}

async function productionChecksums(prisma) {
  const result = {};
  for (const table of TABLES) {
    const [row] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int count,
        md5(COALESCE(string_agg(to_jsonb(source)::text, '|' ORDER BY to_jsonb(source)::text), '')) checksum
      FROM "immos"."${table}" source
    `);
    result[table] = row;
  }
  return result;
}

async function orphanCount(prisma, schema = RECIPE_SCHEMA) {
  if (![RECIPE_SCHEMA, PRODUCTION_SCHEMA].includes(schema)) throw new Error("Schéma de diagnostic interdit.");
  const [row] = await prisma.$queryRawUnsafe(`
    SELECT (
      (SELECT COUNT(*) FROM "${schema}"."asset_files" f
       LEFT JOIN "${schema}"."asset_units" u ON u.id=f.asset_unit_id WHERE u.id IS NULL)
      + (SELECT COUNT(*) FROM "${schema}"."asset_movement_lines" l
       LEFT JOIN "${schema}"."asset_movements" m ON m.id=l.movement_id
       LEFT JOIN "${schema}"."asset_units" u ON u.id=l.asset_unit_id
       WHERE m.id IS NULL OR u.id IS NULL)
      + (SELECT COUNT(*) FROM "${schema}"."asset_document_entries" e
       LEFT JOIN "${schema}"."asset_documents" d ON d.id=e.document_id
       LEFT JOIN "${schema}"."asset_entries" a ON a.id=e.asset_entry_id
       WHERE d.id IS NULL OR a.id IS NULL)
      + (SELECT COUNT(*) FROM "${schema}"."asset_document_lines" l
       LEFT JOIN "${schema}"."asset_documents" d ON d.id=l.document_id
       LEFT JOIN "${schema}"."asset_units" u ON u.id=l.asset_unit_id
       WHERE d.id IS NULL OR (l.asset_unit_id IS NOT NULL AND u.id IS NULL))
    )::int count
  `);
  return row.count;
}

async function main() {
  const env = await loadSupabaseEnv();
  assert.match(env.AUTH_RECIPE_TEST_USER_ID || "", /^[0-9a-f-]{36}$/i);
  assert.ok(env.AUTH_RECIPE_TEST_EMAIL && env.AUTH_RECIPE_TEST_PASSWORD);
  assert.equal(sha256(await readFile("prisma/dev.db")), SQLITE_SHA256);

  const productionMode = process.env.PHASE10F_TARGET === "production";
  const targetSchema = productionMode ? PRODUCTION_SCHEMA : RECIPE_SCHEMA;
  const targetUrl = new URL(productionMode ? env.SUPABASE_DATABASE_URL : env.SUPABASE_DIRECT_URL);
  if (productionMode) {
    assert.equal(targetUrl.port, "6543");
    assert.equal(targetUrl.searchParams.get("schema"), PRODUCTION_SCHEMA);
    targetUrl.searchParams.set("pgbouncer", "true");
    targetUrl.searchParams.set("connection_limit", "1");
    targetUrl.searchParams.set("pool_timeout", "60");
  } else {
    targetUrl.searchParams.set("schema", RECIPE_SCHEMA);
  }
  assert.equal(targetUrl.searchParams.get("schema"), targetSchema);
  const PrismaClient = productionMode ? ProductionPrismaClient : RecipePrismaClient;
  const prisma = new PrismaClient({ datasourceUrl: targetUrl.toString(), errorFormat: "minimal" });
  const authUserId = env.AUTH_RECIPE_TEST_USER_ID;
  const prefix = `F10F-${randomUUID().slice(0, 8).toUpperCase()}`;
  const created = {
    auditEntityIds: new Set(),
    userId: null,
    supplierId: null,
    locationId: null,
    categoryId: null,
    itemId: null,
    entryId: null,
    unitId: null,
    movementId: null,
    documentId: null
  };
  const metrics = [];
  let direction = null;
  let originalAuthProvider = null;
  let auth = null;
  let linkedProfile = null;
  let cleaned = false;
  const results = {};

  async function setAuthLink(action, userId, restoreAuthProvider) {
    if (!productionMode) {
      await executeRecipeAuthLink({ prisma, action, authUserId, userId, restoreAuthProvider });
      linkedProfile = action === "link" ? { id: userId, authProvider: restoreAuthProvider } : null;
      return;
    }
    assert.match(userId || "", /^[A-Za-z0-9_-]{8,64}$/);
    if (action === "link") {
      assert.equal(await prisma.user.count({ where: { externalAuthId: authUserId } }), 0);
      const target = await prisma.user.findUnique({ where: { id: userId }, select: { externalAuthId: true } });
      assert.ok(target);
      assert.equal(target.externalAuthId, null);
      const updated = await prisma.user.updateMany({
        where: { id: userId, externalAuthId: null, status: "ACTIVE", deletedAt: null },
        data: { externalAuthId: authUserId }
      });
      assert.equal(updated.count, 1);
      linkedProfile = { id: userId, authProvider: restoreAuthProvider };
      return;
    }
    const updated = await prisma.user.updateMany({
      where: { id: userId, externalAuthId: authUserId },
      data: { externalAuthId: null, authProvider: restoreAuthProvider }
    });
    assert.equal(updated.count, 1);
    linkedProfile = null;
  }

  const record = (name, result) => {
    metrics.push({ name, status: result.status, elapsedMs: result.elapsedMs });
    return result;
  };

  async function cleanup() {
    if (created.unitId || created.entryId || created.itemId || created.categoryId ||
        created.locationId || created.supplierId || created.userId) {
      await prisma.$transaction(async (tx) => {
        const ids = [...created.auditEntityIds].filter(Boolean);
        if (ids.length) await tx.auditLog.deleteMany({ where: { entityId: { in: ids } } });
        if (created.movementId) {
          await tx.assetMovementLine.deleteMany({ where: { movementId: created.movementId } });
          await tx.assetMovement.deleteMany({ where: { id: created.movementId } });
        }
        if (created.documentId) {
          await tx.assetDocumentEntry.deleteMany({ where: { documentId: created.documentId } });
          await tx.assetDocumentLine.deleteMany({ where: { documentId: created.documentId } });
          await tx.assetDocument.deleteMany({ where: { id: created.documentId } });
        }
        if (created.unitId) {
          await tx.assetFile.deleteMany({ where: { assetUnitId: created.unitId } });
          await tx.assetMovementLine.deleteMany({ where: { assetUnitId: created.unitId } });
          await tx.assetDocumentLine.deleteMany({ where: { assetUnitId: created.unitId } });
          await tx.assetUnit.deleteMany({ where: { id: created.unitId } });
        }
        if (created.entryId) {
          await tx.assetDocumentEntry.deleteMany({ where: { assetEntryId: created.entryId } });
          await tx.assetDocumentLine.deleteMany({ where: { assetEntryId: created.entryId } });
          await tx.assetEntry.deleteMany({ where: { id: created.entryId } });
        }
        if (created.itemId) await tx.assetItem.deleteMany({ where: { id: created.itemId } });
        if (created.categoryId) await tx.assetCategory.deleteMany({ where: { id: created.categoryId } });
        if (created.locationId) await tx.location.deleteMany({ where: { id: created.locationId } });
        if (created.supplierId) await tx.supplier.deleteMany({ where: { id: created.supplierId } });
        if (created.userId) await tx.user.deleteMany({ where: { id: created.userId } });
      }, { maxWait: 10_000, timeout: 120_000 });
    }
    if (linkedProfile && await prisma.user.count({
      where: { id: linkedProfile.id, externalAuthId: authUserId }
    })) {
      await setAuthLink("unlink", linkedProfile.id, linkedProfile.authProvider);
    }
    if (auth) {
      await auth.client.auth.signOut({ scope: "local" }).catch(() => undefined);
    }
    cleaned = true;
  }

  try {
    const [schema] = await prisma.$queryRawUnsafe("SELECT current_schema() schema");
    assert.equal(schema.schema, targetSchema);
    assert.deepEqual(await counts(prisma, RECIPE_SCHEMA), { total: 253, asset_units: 13, asset_files: 0 });
    assert.deepEqual(await counts(prisma, "immos"), { total: 222, asset_units: 12, asset_files: 0 });
    assert.equal(await orphanCount(prisma, RECIPE_SCHEMA), 0);
    assert.equal(await orphanCount(prisma, PRODUCTION_SCHEMA), 0);
    const productionBefore = await productionChecksums(prisma);

    const unauthenticatedPage = await request("/parc");
    assert.ok([302, 303, 307, 308].includes(unauthenticatedPage.response.status));
    assert.match(unauthenticatedPage.response.headers.get("location") || "", /^\/connexion\?returnTo=/);
    metrics.push({ name: "unauthenticated_page", status: unauthenticatedPage.response.status, elapsedMs: unauthenticatedPage.elapsedMs });
    const unauthenticatedApi = await jsonRequest("/api/asset-units", "");
    assert.equal(unauthenticatedApi.status, 401);
    results.unauthenticated = { page: unauthenticatedPage.response.status, api: 401 };

    direction = await prisma.user.findFirst({
      where: {
        role: "DIRECTION", status: "ACTIVE", deletedAt: null, externalAuthId: null
      },
      select: { id: true, authProvider: true }
    });
    assert.ok(direction, "Aucun profil DIRECTION de recette sûr.");
    originalAuthProvider = direction.authProvider;

    auth = cookieJarClient(env);
    const login = await auth.client.auth.signInWithPassword({
      email: env.AUTH_RECIPE_TEST_EMAIL,
      password: env.AUTH_RECIPE_TEST_PASSWORD
    });
    assert.equal(login.error, null);
    assert.ok(auth.count() > 0);
    const verified = await auth.client.auth.getUser();
    assert.equal(verified.error, null);
    assert.equal(verified.data.user?.id, authUserId);

    const denied = await request("/", auth.header());
    assert.equal(denied.response.status, 200);
    assert.match(await denied.response.text(), /Acc.s non autoris/);
    assert.equal(await prisma.user.count({ where: { externalAuthId: authUserId } }), 0);
    results.authenticatedWithoutMembership = "denied";

    const roleExpectations = [
      ["DIRECTION", "Direction", 200],
      ["INVENTORY_MANAGER", "Gestionnaire inventaire", 403],
      ["MAINTENANCE_MANAGER", "Gestionnaire maintenance", 403],
      ["BASIC_USER", "Lecture seule", 403]
    ];
    results.roles = {};
    for (const [role, roleLabel, usersStatus] of roleExpectations) {
      const profile = await prisma.user.findFirst({
        where: { role, status: "ACTIVE", deletedAt: null, externalAuthId: null },
        select: { id: true, name: true, authProvider: true }
      });
      assert.ok(profile, `Profil ${role} sûr introuvable.`);
      await setAuthLink("link", profile.id, profile.authProvider);
      const shell = await request("/", auth.header());
      assert.equal(shell.response.status, 200);
      const html = await shell.response.text();
      assert.match(html, new RegExp(profile.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(html, new RegExp(roleLabel));
      assert.match(html, /D.connexion/);
      assert.doesNotMatch(html, /Judi Randria/);
      const usersAccess = await jsonRequest("/api/users", auth.header());
      const rolesAccess = await jsonRequest("/api/roles", auth.header());
      assert.equal(usersAccess.status, usersStatus);
      assert.equal(rolesAccess.status, usersStatus);
      if (role === "BASIC_USER") {
        assert.doesNotMatch(html, /Cr.er l.entr.e/);
        const forbiddenWrite = await jsonMutation("/api/asset-categories", auth.header(), "POST", {
          name: `${prefix} Forbidden`, code: `${prefix}-NOPE`
        });
        assert.equal(forbiddenWrite.status, 403);
      }
      results.roles[role] = { shell: 200, users: usersStatus, roles: usersStatus };
      await setAuthLink("unlink", profile.id, profile.authProvider);
      const logoutResult = await auth.client.auth.signOut({ scope: "local" });
      assert.equal(logoutResult.error, null);
      const loggedOut = await request("/", auth.header());
      assert.ok([302, 303, 307, 308].includes(loggedOut.response.status));
      const relogin = await auth.client.auth.signInWithPassword({
        email: env.AUTH_RECIPE_TEST_EMAIL,
        password: env.AUTH_RECIPE_TEST_PASSWORD
      });
      assert.equal(relogin.error, null);
      assert.equal(relogin.data.user?.id, authUserId);
    }

    await setAuthLink("link", direction.id, originalAuthProvider);

    const pages = ["/", "/parc", "/documents", "/mouvements", "/referentiels", "/connexion"];
    for (const pathname of pages) {
      const result = await request(pathname, auth.header());
      assert.ok([200, 302, 303, 307, 308].includes(result.response.status));
      assert.notEqual(result.response.status, 500);
      await result.response.arrayBuffer();
      metrics.push({ name: `page:${pathname}`, status: result.response.status, elapsedMs: result.elapsedMs });
    }
    results.navigation = `${pages.length}/${pages.length}`;

    const reads = [
      "/api/asset-options",
      "/api/asset-units?q=&status=IN_SERVICE",
      "/api/asset-entries?entryStatus=VALIDATED",
      "/api/asset-categories?q=&includeDisabled=true",
      "/api/locations?q=&includeDisabled=true",
      "/api/suppliers?q=&includeDisabled=true",
      "/api/asset-items?q=&includeDisabled=true",
      "/api/users",
      "/api/roles",
      "/api/asset-files",
      "/api/asset-movements",
      "/api/asset-documents"
    ];
    for (const pathname of reads) {
      const result = record(`read:${pathname}`, await jsonRequest(pathname, auth.header()));
      assert.equal(result.status, 200, pathname);
    }
    results.readModules = `${reads.length}/${reads.length}`;

    const invalid = record(
      "validation:empty_asset",
      await jsonMutation("/api/asset-units", auth.header(), "POST", {})
    );
    assert.equal(invalid.status, 400);

    const rollbackCode = `${prefix}-ROLLBACK`;
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await tx.supplier.create({
          data: {
            name: `${prefix} Rollback Supplier`,
            code: rollbackCode,
            supplierType: "TEST",
            createdById: direction.id,
            updatedById: direction.id
          }
        });
        throw new Error("PHASE10F_G2_EXPECTED_ROLLBACK");
      }),
      /PHASE10F_G2_EXPECTED_ROLLBACK/
    );
    assert.equal(await prisma.supplier.count({ where: { code: rollbackCode } }), 0);
    results.transactionRollback = "confirmed";

    const userCreate = record("user:create", await jsonMutation("/api/users", auth.header(), "POST", {
      email: `${prefix.toLowerCase()}@example.invalid`,
      name: `${prefix} User`,
      role: "BASIC_USER",
      status: "ACTIVE",
      authProvider: "recipe-test"
    }));
    assert.equal(userCreate.status, 201);
    created.userId = userCreate.body.user.id;
    created.auditEntityIds.add(created.userId);
    const userPatch = record("user:update", await jsonMutation(
      `/api/users/${created.userId}`, auth.header(), "PATCH", { name: `${prefix} User Updated` }
    ));
    assert.equal(userPatch.status, 200);
    assert.equal(record("user:read", await jsonRequest(`/api/users/${created.userId}`, auth.header())).status, 200);
    assert.equal(record("user:delete", await jsonRequest(
      `/api/users/${created.userId}`, auth.header(), { method: "DELETE" }
    )).status, 200);

    const categoryCreate = record("category:create", await jsonMutation(
      "/api/asset-categories", auth.header(), "POST",
      { name: `${prefix} Category`, code: `${prefix}-CAT`, description: "Fixture 10F-F" }
    ));
    assert.equal(categoryCreate.status, 201);
    created.categoryId = categoryCreate.body.item.id;
    created.auditEntityIds.add(created.categoryId);
    const duplicateCategory = record("category:duplicate_refused", await jsonMutation(
      "/api/asset-categories", auth.header(), "POST",
      { name: `${prefix} Category Duplicate`, code: `${prefix}-CAT`, description: "Duplicate fixture" }
    ));
    assert.notEqual(duplicateCategory.status, 201);
    assert.equal(await prisma.assetCategory.count({ where: { code: `${prefix}-CAT` } }), 1);
    assert.equal(record("category:update", await jsonMutation(
      `/api/asset-categories/${created.categoryId}`, auth.header(), "PATCH",
      { description: "Fixture 10F-F updated" }
    )).status, 200);

    const locationCreate = record("location:create", await jsonMutation(
      "/api/locations", auth.header(), "POST",
      { name: `${prefix} Location`, code: `${prefix}-LOC`, locationType: "ROOM" }
    ));
    assert.equal(locationCreate.status, 201);
    created.locationId = locationCreate.body.item.id;
    created.auditEntityIds.add(created.locationId);
    assert.equal(record("location:update", await jsonMutation(
      `/api/locations/${created.locationId}`, auth.header(), "PATCH", { notes: "Fixture updated" }
    )).status, 200);

    const supplierCreate = record("supplier:create", await jsonMutation(
      "/api/suppliers", auth.header(), "POST",
      { name: `${prefix} Supplier`, code: `${prefix}-SUP`, supplierType: "TEST" }
    ));
    assert.equal(supplierCreate.status, 201);
    created.supplierId = supplierCreate.body.item.id;
    created.auditEntityIds.add(created.supplierId);
    assert.equal(record("supplier:update", await jsonMutation(
      `/api/suppliers/${created.supplierId}`, auth.header(), "PATCH", { notes: "Fixture updated" }
    )).status, 200);

    const itemCreate = record("item:create", await jsonMutation(
      "/api/asset-items", auth.header(), "POST",
      {
        name: `${prefix} Model`,
        code: `${prefix}-MOD`,
        description: "Fixture modèle/marque",
        categoryId: created.categoryId,
        supplierId: created.supplierId,
        unitLabel: "unité"
      }
    ));
    assert.equal(itemCreate.status, 201);
    created.itemId = itemCreate.body.item.id;
    created.auditEntityIds.add(created.itemId);
    assert.equal(record("item:update", await jsonMutation(
      `/api/asset-items/${created.itemId}`, auth.header(), "PATCH",
      { description: "Fixture modèle mise à jour" }
    )).status, 200);

    for (const [name, path] of [
      ["category:search", `/api/asset-categories?q=${prefix}`],
      ["location:search", `/api/locations?q=${prefix}`],
      ["supplier:search", `/api/suppliers?q=${prefix}`],
      ["item:search", `/api/asset-items?q=${prefix}`]
    ]) {
      const result = record(name, await jsonRequest(path, auth.header()));
      assert.equal(result.status, 200);
      assert.ok(result.body.items.length >= 1);
    }

    const invalidReference = record("asset:invalid_reference_refused", await jsonMutation(
      "/api/asset-units", auth.header(), "POST",
      {
        assetItemId: "phase10f-g2-missing",
        locationId: created.locationId,
        supplierKnown: false,
        entryType: "PURCHASE",
        entryDate: new Date().toISOString(),
        initialCondition: "NEW",
        initialStatus: "IN_STOCK",
        informationStatus: "COMPLETE",
        serialNumber: `${prefix}-INVALID`,
        priceKnown: false,
        purchaseDateKnown: false,
        invoiceAvailable: false
      }
    ));
    assert.notEqual(invalidReference.status, 201);

    const unitCreate = record("asset:create", await jsonMutation(
      "/api/asset-units", auth.header(), "POST",
      {
        assetItemId: created.itemId,
        locationId: created.locationId,
        supplierId: created.supplierId,
        supplierKnown: true,
        entryType: "PURCHASE",
        entryDate: new Date().toISOString(),
        initialCondition: "NEW",
        initialStatus: "IN_STOCK",
        informationStatus: "COMPLETE",
        serialNumber: `${prefix}-SERIAL`,
        priceKnown: true,
        unitPrice: 12345,
        purchaseDateKnown: false,
        invoiceAvailable: false,
        notes: "Fixture 10F-F"
      }
    ));
    assert.equal(unitCreate.status, 201);
    created.entryId = unitCreate.body.entry.id;
    created.unitId = unitCreate.body.unit.id;
    created.auditEntityIds.add(created.entryId);
    created.auditEntityIds.add(created.unitId);

    const unitRead = record("asset:read", await jsonRequest(
      `/api/asset-units/${created.unitId}`, auth.header()
    ));
    assert.equal(unitRead.status, 200);
    assert.equal(unitRead.body.unit.id, created.unitId);
    const unitPatch = record("asset:update", await jsonMutation(
      `/api/asset-units/${created.unitId}`, auth.header(), "PATCH",
      { condition: "VERY_GOOD", notes: "Fixture 10F-F updated" }
    ));
    assert.equal(unitPatch.status, 200);
    assert.equal(unitPatch.body.unit.condition, "VERY_GOOD");

    const entryRead = record("entry:read", await jsonRequest(
      `/api/asset-entries/${created.entryId}`, auth.header()
    ));
    assert.equal(entryRead.status, 200);
    assert.equal(record("entry:update", await jsonMutation(
      `/api/asset-entries/${created.entryId}`, auth.header(), "PATCH",
      { notes: "Fixture entry updated", informationStatus: "COMPLETE" }
    )).status, 200);

    const filtered = record("asset:filter_search_sort", await jsonRequest(
      `/api/asset-units?q=${prefix}&condition=VERY_GOOD&status=IN_STOCK&assetItemId=${created.itemId}&locationId=${created.locationId}`,
      auth.header()
    ));
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.units.length, 1);
    assert.equal(filtered.body.units[0].id, created.unitId);

    const uploadForm = new FormData();
    uploadForm.set("assetUnitId", created.unitId);
    const uploadValidation = record("upload:validation_without_file", await jsonRequest(
      "/api/asset-files", auth.header(), { method: "POST", body: uploadForm }
    ));
    assert.equal(uploadValidation.status, 400);
    assert.equal(await prisma.assetFile.count(), 0);

    const alternateLocation = await prisma.location.findFirst({
      where: {
        id: { not: created.locationId },
        status: "ACTIVE",
        deletedAt: null
      },
      select: { id: true }
    });
    assert.ok(alternateLocation);
    const movementCreate = record("movement:create", await jsonMutation(
      "/api/asset-movements", auth.header(), "POST",
      {
        movementType: "ASSIGNMENT",
        movementDate: new Date().toISOString(),
        reason: "Fixture 10F-F",
        notes: "Mouvement DRAFT synthétique",
        lines: [{
          assetUnitId: created.unitId,
          toLocationId: alternateLocation.id,
          lineNotes: "Fixture 10F-F"
        }]
      }
    ));
    assert.equal(movementCreate.status, 201);
    created.movementId = movementCreate.body.movement.id;
    created.auditEntityIds.add(created.movementId);
    assert.equal(record("movement:read", await jsonRequest(
      `/api/asset-movements/${created.movementId}`, auth.header()
    )).status, 200);
    assert.equal(record("movement:update", await jsonMutation(
      `/api/asset-movements/${created.movementId}`, auth.header(), "PATCH",
      { reason: "Fixture 10F-F updated", notes: "Mouvement DRAFT mis à jour" }
    )).status, 200);

    const documentCreate = record("document:create", await jsonMutation(
      "/api/asset-documents", auth.header(), "POST",
      {
        documentType: "ENTRY_SLIP",
        documentDate: new Date().toISOString(),
        title: `${prefix} Document`,
        notes: "Fixture 10F-F"
      }
    ));
    assert.equal(documentCreate.status, 201);
    created.documentId = documentCreate.body.document.id;
    created.auditEntityIds.add(created.documentId);
    assert.equal(record("document:read", await jsonRequest(
      `/api/asset-documents/${created.documentId}`, auth.header()
    )).status, 200);
    assert.equal(record("document:update", await jsonMutation(
      `/api/asset-documents/${created.documentId}`, auth.header(), "PATCH",
      { title: `${prefix} Document Updated`, notes: "Fixture document mise à jour" }
    )).status, 200);

    const notFound = record("errors:404", await jsonRequest(
      "/api/asset-units/phase10f-f-missing", auth.header()
    ));
    assert.equal(notFound.status, 404);

    const unitDelete = record("asset:delete", await jsonRequest(
      `/api/asset-units/${created.unitId}`, auth.header(), { method: "DELETE" }
    ));
    assert.equal(unitDelete.status, 200);
    assert.equal(record("asset:deleted_404", await jsonRequest(
      `/api/asset-units/${created.unitId}`, auth.header()
    )).status, 404);

    for (const [name, path] of [
      ["item:delete", `/api/asset-items/${created.itemId}`],
      ["category:delete", `/api/asset-categories/${created.categoryId}`],
      ["location:delete", `/api/locations/${created.locationId}`],
      ["supplier:delete", `/api/suppliers/${created.supplierId}`]
    ]) {
      const result = record(name, await jsonRequest(path, auth.header(), { method: "DELETE" }));
      assert.equal(result.status, 200);
    }

    const refresh = await request("/", auth.header());
    assert.equal(refresh.response.status, 200);
    assert.match(await refresh.response.text(), /D.connexion/);
    const logout = await auth.client.auth.signOut({ scope: "local" });
    assert.equal(logout.error, null);
    const afterLogout = await request("/", auth.header());
    assert.ok([302, 303, 307, 308].includes(afterLogout.response.status));
    results.session = "persisted_then_logged_out";

    await cleanup();
    const finalRecipe = await counts(prisma, RECIPE_SCHEMA);
    const finalProduction = await counts(prisma, "immos");
    assert.deepEqual(finalRecipe, { total: 253, asset_units: 13, asset_files: 0 });
    assert.deepEqual(finalProduction, { total: 222, asset_units: 12, asset_files: 0 });
    assert.equal(await orphanCount(prisma, RECIPE_SCHEMA), 0);
    assert.equal(await orphanCount(prisma, PRODUCTION_SCHEMA), 0);
    assert.deepEqual(await productionChecksums(prisma), productionBefore);
    assert.equal(await prisma.user.count({ where: { externalAuthId: authUserId } }), 0);
    assert.equal(sha256(await readFile("prisma/dev.db")), SQLITE_SHA256);

    const maxMs = Math.max(...metrics.map((entry) => entry.elapsedMs));
    const averageMs = Math.round(
      metrics.reduce((sum, entry) => sum + entry.elapsedMs, 0) / metrics.length * 10
    ) / 10;
    console.log(JSON.stringify({
      result: productionMode ? "PHASE10F_G2_FUNCTIONAL_PRODUCTION_OK" : "PHASE10F_F_FUNCTIONAL_RECIPE_OK",
      runtime: targetSchema,
      scenarios: results,
      checks: metrics.length,
      httpFailures: metrics.filter((entry) => entry.status >= 500).length,
      performance: { averageMs, maxMs },
      finalRecipe,
      finalProduction,
      recipeOrphans: 0,
      productionOrphans: 0,
      temporaryRowsRemaining: 0,
      temporaryMembershipsRemaining: 0,
      storageWrites: 0,
      productionRestored: true,
      sqliteUnchanged: true,
      secretsLogged: false
    }, null, 2));
  } finally {
    if (!cleaned) await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Validation fonctionnelle Recipe échouée.");
  process.exitCode = 1;
});
