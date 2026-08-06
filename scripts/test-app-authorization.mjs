import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { register } from "node:module";
import test from "node:test";

const rootUrl = pathToFileURL(`${process.cwd()}${path.sep}`).href;
const LOADER = `
const root = ${JSON.stringify(rootUrl)};
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export%20default%20undefined", shortCircuit: true };
  }
  if (specifier === "next/headers") {
    return {
      url: "data:text/javascript,export%20async%20function%20cookies()%7Bthrow%20new%20Error('not%20injected')%7D",
      shortCircuit: true
    };
  }
  if (specifier === "next/server") {
    return {
      url: "data:text/javascript,export%20class%20NextResponse%7Bstatic%20json(body%2Cinit%3D%7B%7D)%7Breturn%20%7Bbody%2Cstatus%3Ainit.status%7C%7C200%7D%7D%7D",
      shortCircuit: true
    };
  }
  if (specifier.startsWith("@/")) {
    if (specifier.startsWith("@/generated/prisma-")) {
      return { url: new URL(specifier.slice(2) + "/index.js", root).href, shortCircuit: true };
    }
    return { url: new URL(specifier.slice(2) + ".js", root).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(LOADER)}`);

const {
  APP_PERMISSIONS,
  APP_ROLES,
  AppAuthorizationError,
  getCurrentAppUser,
  hasPermission,
  requirePermission,
  requireRole
} = await import("../lib/authorization.js");
const { authorizeApiRequest } = await import("../lib/authorization-http.js");

function prismaWith(matches) {
  const calls = [];
  return {
    calls,
    user: {
      async findMany(args) {
        calls.push(args);
        return matches;
      }
    }
  };
}

function user(overrides = {}) {
  return {
    id: "app-user-1",
    name: "Utilisateur de recette",
    externalAuthId: "auth-user-1",
    authProvider: "supabase",
    status: "ACTIVE",
    deletedAt: null,
    role: "BASIC_USER",
    ...overrides
  };
}

test("un utilisateur non connecté est distingué sans accès Prisma", async () => {
  const prismaClient = prismaWith([]);
  const result = await getCurrentAppUser({ authUser: null, prismaClient });
  assert.equal(result.status, "unauthenticated");
  assert.equal(prismaClient.calls.length, 0);
});

test("un utilisateur Auth absent d’Inventaire Immos est refusé sans attribution", async () => {
  const prismaClient = prismaWith([]);
  const result = await getCurrentAppUser({
    authUser: { id: "auth-user-1", email: "ignored@example.invalid" },
    prismaClient
  });
  assert.equal(result.status, "not_authorized");
  assert.equal(prismaClient.calls[0].where.externalAuthId, "auth-user-1");
  assert.equal(prismaClient.calls[0].where.authProvider, "supabase");
});

test("une appartenance inactive est distinguée", async () => {
  const result = await getCurrentAppUser({
    authUser: { id: "auth-user-1" },
    prismaClient: prismaWith([user({ status: "DISABLED" })])
  });
  assert.equal(result.status, "inactive");
});

test("une appartenance supprimée est inactive", async () => {
  const result = await getCurrentAppUser({
    authUser: { id: "auth-user-1" },
    prismaClient: prismaWith([user({ deletedAt: new Date() })])
  });
  assert.equal(result.status, "inactive");
});

test("plusieurs correspondances sont refusées de manière fermée", async () => {
  const result = await getCurrentAppUser({
    authUser: { id: "auth-user-1" },
    prismaClient: prismaWith([user(), user({ id: "app-user-2" })])
  });
  assert.equal(result.status, "invalid_membership");
});

test("lecture seule possède uniquement la permission de lecture", async () => {
  const result = await getCurrentAppUser({
    authUser: { id: "auth-user-1" },
    prismaClient: prismaWith([user()])
  });
  assert.equal(result.status, "authorized");
  assert.equal(result.user.appRole, "lecture_seule");
  assert.equal(hasPermission(result.user, APP_PERMISSIONS.READ), true);
  assert.equal(hasPermission(result.user, APP_PERMISSIONS.ASSETS_WRITE), false);
});

test("un gestionnaire maintenance conserve ses permissions métier existantes", async () => {
  const result = await getCurrentAppUser({
    authUser: { id: "auth-user-1" },
    prismaClient: prismaWith([user({ role: "MAINTENANCE_MANAGER" })])
  });
  assert.equal(result.user.appRole, "gestionnaire");
  assert.equal(hasPermission(result.user, APP_PERMISSIONS.MOVEMENTS_CREATE), true);
  assert.equal(hasPermission(result.user, APP_PERMISSIONS.FILES_UPLOAD), true);
  assert.equal(hasPermission(result.user, APP_PERMISSIONS.USERS_MANAGE), false);
});

test("un responsable inventaire est gestionnaire sans administration des utilisateurs", async () => {
  const result = await getCurrentAppUser({
    authUser: { id: "auth-user-1" },
    prismaClient: prismaWith([user({ role: "INVENTORY_MANAGER" })])
  });
  assert.equal(result.user.appRole, "gestionnaire");
  assert.equal(hasPermission(result.user, APP_PERMISSIONS.ASSETS_WRITE), true);
  assert.equal(hasPermission(result.user, APP_PERMISSIONS.USERS_MANAGE), false);
});

test("admin possède toutes les permissions déclarées", async () => {
  const result = await getCurrentAppUser({
    authUser: { id: "auth-user-1" },
    prismaClient: prismaWith([user({ role: "DIRECTION" })])
  });
  assert.equal(result.user.appRole, "admin");
  for (const permission of Object.values(APP_PERMISSIONS)) {
    assert.equal(hasPermission(result.user, permission), true);
  }
});

test("seul DIRECTION possède users.manage", async () => {
  const cases = [
    ["DIRECTION", true],
    ["INVENTORY_MANAGER", false],
    ["MAINTENANCE_MANAGER", false],
    ["BASIC_USER", false]
  ];
  for (const [role, expected] of cases) {
    const result = await getCurrentAppUser({
      authUser: { id: "auth-user-1" },
      prismaClient: prismaWith([user({ role })])
    });
    assert.equal(
      hasPermission(result.user, APP_PERMISSIONS.USERS_MANAGE),
      expected,
      role
    );
  }
});

test("requireRole distingue admin et gestionnaire sans promotion implicite", async () => {
  const admin = await requireRole(APP_ROLES.ADMIN, {
    authUser: { id: "auth-user-1" },
    prismaClient: prismaWith([user({ role: "DIRECTION" })])
  });
  assert.equal(admin.role, "DIRECTION");

  const managerOptions = {
    authUser: { id: "auth-user-1" },
    prismaClient: prismaWith([user({ role: "INVENTORY_MANAGER" })])
  };
  assert.equal(
    (await requireRole(APP_ROLES.MANAGER, managerOptions)).role,
    "INVENTORY_MANAGER"
  );
  await assert.rejects(
    requireRole(APP_ROLES.ADMIN, managerOptions),
    (error) => error.code === "insufficient_role" && error.status === 403
  );
});

test("les routes utilisateurs et rôles autorisent DIRECTION et refusent les autres rôles", async () => {
  const routeSources = await Promise.all([
    readFile("app/api/users/route.js", "utf8"),
    readFile("app/api/users/[id]/route.js", "utf8"),
    readFile("app/api/roles/route.js", "utf8")
  ]);
  for (const source of routeSources) {
    assert.match(
      source,
      /authorizeApiRequest\(APP_PERMISSIONS\.USERS_MANAGE\)/
    );
  }

  for (const [role, expectedStatus] of [
    ["DIRECTION", null],
    ["INVENTORY_MANAGER", 403],
    ["MAINTENANCE_MANAGER", 403],
    ["BASIC_USER", 403]
  ]) {
    const result = await authorizeApiRequest(APP_PERMISSIONS.USERS_MANAGE, {
      authUser: { id: "auth-user-1" },
      prismaClient: prismaWith([user({ role })])
    });
    assert.equal(result.response?.status ?? null, expectedStatus, role);
  }
});

test("un rôle ou isAdmin fourni par le client ne modifie jamais les permissions", async () => {
  const result = await getCurrentAppUser({
    authUser: {
      id: "auth-user-1",
      role: "admin",
      isAdmin: true,
      user_metadata: { role: "admin" },
      app_metadata: { role: "admin" }
    },
    prismaClient: prismaWith([user({ role: "BASIC_USER" })])
  });
  assert.equal(result.user.appRole, APP_ROLES.READ_ONLY);
  assert.equal(hasPermission(result.user, APP_PERMISSIONS.USERS_MANAGE), false);
});

test("les permissions historiques des deux gestionnaires restent exactes", async () => {
  const inventory = await getCurrentAppUser({
    authUser: { id: "auth-user-1" },
    prismaClient: prismaWith([user({ role: "INVENTORY_MANAGER" })])
  });
  assert.deepEqual(
    new Set(inventory.user.permissions),
    new Set([
      APP_PERMISSIONS.READ,
      APP_PERMISSIONS.ASSETS_WRITE,
      APP_PERMISSIONS.DOCUMENTS_WRITE,
      APP_PERMISSIONS.MOVEMENTS_CREATE,
      APP_PERMISSIONS.MOVEMENTS_MANAGE,
      APP_PERMISSIONS.FILES_UPLOAD,
      APP_PERMISSIONS.FILES_MANAGE,
      APP_PERMISSIONS.REFERENTIALS_WRITE
    ])
  );

  const maintenance = await getCurrentAppUser({
    authUser: { id: "auth-user-1" },
    prismaClient: prismaWith([user({ role: "MAINTENANCE_MANAGER" })])
  });
  assert.deepEqual(
    new Set(maintenance.user.permissions),
    new Set([
      APP_PERMISSIONS.READ,
      APP_PERMISSIONS.MOVEMENTS_CREATE,
      APP_PERMISSIONS.FILES_UPLOAD
    ])
  );
});

test("une écriture lecture seule produit insufficient_role", async () => {
  await assert.rejects(
    requirePermission(APP_PERMISSIONS.ASSETS_WRITE, {
      authUser: { id: "auth-user-1" },
      prismaClient: prismaWith([user()])
    }),
    (error) =>
      error instanceof AppAuthorizationError &&
      error.code === "insufficient_role" &&
      error.status === 403
  );
});

test("une indisponibilité Auth échoue de manière fermée sans détail", async () => {
  await assert.rejects(
    getCurrentAppUser({
      getAuthUser: async () => {
        throw new Error("raw-secret-diagnostic");
      },
      prismaClient: prismaWith([])
    }),
    (error) =>
      error.code === "authentication_unavailable" &&
      error.status === 503 &&
      !error.message.includes("raw-secret-diagnostic")
  );
});

test("une indisponibilité de la base d’autorisation échoue sans détail Prisma", async () => {
  await assert.rejects(
    getCurrentAppUser({
      authUser: { id: "auth-user-1" },
      prismaClient: {
        user: {
          async findMany() {
            throw new Error("raw-database-secret");
          }
        }
      }
    }),
    (error) =>
      error.code === "authorization_unavailable" &&
      error.status === 503 &&
      !error.message.includes("raw-database-secret")
  );
});

test("les API distinguent 401, 403 et autorisation suffisante", async () => {
  const unauthenticated = await authorizeApiRequest(APP_PERMISSIONS.READ, {
    authUser: null,
    prismaClient: prismaWith([])
  });
  assert.equal(unauthenticated.response.status, 401);

  const forbidden = await authorizeApiRequest(APP_PERMISSIONS.READ, {
    authUser: { id: "auth-user-1" },
    prismaClient: prismaWith([])
  });
  assert.equal(forbidden.response.status, 403);

  const allowed = await authorizeApiRequest(APP_PERMISSIONS.READ, {
    authUser: { id: "auth-user-1" },
    prismaClient: prismaWith([user()])
  });
  assert.equal(allowed.response, null);
  assert.equal(allowed.user.id, "app-user-1");
});

test("aucun rôle, userId ou x-user-id client n’est utilisé comme autorité", async () => {
  const source = await readFile("lib/request-user.js", "utf8");
  assert.doesNotMatch(source, /headers\.get|x-user-id|isAdmin/);
  assert.match(source, /requireAuthorizedUser/);
});

test("toutes les pages métier possèdent la garde serveur", async () => {
  const pages = [
    "app/page.js",
    "app/parc/page.js",
    "app/parc/[id]/page.js",
    "app/documents/page.js",
    "app/mouvements/page.js",
    "app/referentiels/page.js"
  ];
  for (const file of pages) {
    assert.match(await readFile(file, "utf8"), /authorizePrivatePage/);
  }
  assert.doesNotMatch(await readFile("app/connexion/page.js", "utf8"), /authorizePrivatePage/);
});

test("toutes les API privées sont gardées et health reste publique", async () => {
  async function routes(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) result.push(...await routes(child));
      else if (entry.name === "route.js") result.push(child);
    }
    return result;
  }
  for (const file of await routes("app/api")) {
    const source = await readFile(file, "utf8");
    if (file.endsWith(path.join("health", "route.js"))) {
      assert.doesNotMatch(source, /authorizeApiRequest|reference-api/);
    } else {
      assert.match(source, /authorizeApiRequest|reference-api/);
    }
  }
});

test("les modules privilégiés restent hors de la frontière client", async () => {
  const clientFiles = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.name.endsWith(".js")) {
        const source = await readFile(child, "utf8");
        if (/^[\"']use client[\"'];/m.test(source)) clientFiles.push({ child, source });
      }
    }
  }
  await walk("app");
  for (const { source } of clientFiles) {
    assert.doesNotMatch(
      source,
      /authorization(?:-http|-page)?|admin-client|SUPABASE_SERVICE_ROLE_KEY/
    );
  }
});
