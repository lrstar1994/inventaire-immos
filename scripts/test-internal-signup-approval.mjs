import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const rootUrl = pathToFileURL(`${process.cwd()}${path.sep}`).href;
const loader = `
const root = ${JSON.stringify(rootUrl)};
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,export default undefined", shortCircuit: true };
  if (specifier === "next/headers") return { url: "data:text/javascript,export async function cookies(){throw new Error('not injected')}", shortCircuit: true };
  if (specifier.startsWith("@/")) {
    if (specifier.startsWith("@/generated/prisma-")) return { url: new URL(specifier.slice(2) + "/index.js", root).href, shortCircuit: true };
    return { url: new URL(specifier.slice(2) + ".js", root).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(loader)}`);

const { executeSignup, validateSignupInput } = await import("../lib/supabase/signup-flow.js");
const { APP_PERMISSIONS, getCurrentAppUser, hasPermission } = await import("../lib/authorization.js");

function form(values) {
  return { get(name) { return values[name] ?? null; } };
}

function prismaMock({ existing = null } = {}) {
  const created = [];
  const users = {
    async findFirst() { return existing; },
    async create({ data }) { created.push(data); return { id: "pending-1", status: data.status }; }
  };
  return {
    created,
    user: users,
    async $transaction(callback) { return callback({ user: users }); }
  };
}

function validForm(overrides = {}) {
  return form({
    name: "Collaboratrice Test",
    email: "collaboratrice@example.invalid",
    password: "mot-de-passe-factice",
    passwordConfirmation: "mot-de-passe-factice",
    returnTo: "/parc",
    ...overrides
  });
}

test("les validations refusent mot de passe faible, confirmation différente et redirection externe", () => {
  assert.equal(validateSignupInput(validForm({ password: "court", passwordConfirmation: "court" })).valid, false);
  assert.equal(validateSignupInput(validForm({ passwordConfirmation: "différent" })).code, "password_mismatch");
  assert.equal(validateSignupInput(validForm({ returnTo: "https://evil.example" })).returnTo, "/");
});

test("une inscription Auth valide crée uniquement un User PENDING BASIC_USER", async () => {
  const prisma = prismaMock();
  const authCalls = [];
  const result = await executeSignup({
    formData: validForm(),
    prismaClient: prisma,
    client: { auth: { async signUp(payload) {
      authCalls.push(payload);
      return { data: { user: { id: "auth-test-1", identities: [{ id: "identity-1" }] }, session: null }, error: null };
    } } }
  });
  assert.equal(result.success, true);
  assert.equal(result.code, "email_confirmation_required");
  assert.deepEqual(authCalls[0], { email: "collaboratrice@example.invalid", password: "mot-de-passe-factice" });
  assert.deepEqual(prisma.created[0], {
    email: "collaboratrice@example.invalid",
    name: "Collaboratrice Test",
    role: "BASIC_USER",
    status: "PENDING",
    authProvider: "supabase",
    externalAuthId: "auth-test-1"
  });
});

test("un doublon email métier bloque signUp avant tout appel Auth", async () => {
  let authCalled = false;
  const result = await executeSignup({
    formData: validForm(),
    prismaClient: prismaMock({ existing: { id: "existing" } }),
    client: { auth: { async signUp() { authCalled = true; } } }
  });
  assert.equal(result.code, "account_exists");
  assert.equal(authCalled, false);
});

test("un externalAuthId dupliqué dans la transaction ne crée pas une seconde demande", async () => {
  const prisma = prismaMock();
  let calls = 0;
  prisma.user.findFirst = async () => (++calls === 1 ? null : { id: "duplicate" });
  const result = await executeSignup({
    formData: validForm(),
    prismaClient: prisma,
    client: { auth: { async signUp() { return { data: { user: { id: "auth-test-1", identities: [{}] }, session: {} }, error: null }; } } }
  });
  assert.equal(result.code, "account_exists");
  assert.equal(prisma.created.length, 0);
});

test("PENDING est distingué et ne reçoit aucune permission métier", async () => {
  const result = await getCurrentAppUser({
    authUser: { id: "auth-test-1" },
    prismaClient: { user: { async findMany() { return [{ id: "pending-1", externalAuthId: "auth-test-1", authProvider: "supabase", status: "PENDING", deletedAt: null, role: "BASIC_USER", name: "Test" }]; } } }
  });
  assert.equal(result.status, "pending");
  assert.equal(result.user, null);
  assert.equal(hasPermission(result.user, APP_PERMISSIONS.READ), false);
});

test("l'écran PENDING masque le shell et conserve une déconnexion", async () => {
  const denied = await readFile("app/components/access-denied.js", "utf8");
  const shell = await readFile("app/components/app-shell.js", "utf8");
  assert.match(denied, /Demande d’accès en attente/);
  assert.match(denied, /form action=\{logoutAction\}/);
  assert.match(shell, /access\.status !== "authorized"/);
});

test("la validation DIRECTION exige users.manage, un rôle explicite et un statut PENDING", async () => {
  const route = await readFile("app/api/users/[id]/approve/route.js", "utf8");
  assert.match(route, /authorizeApiRequest\(APP_PERMISSIONS\.USERS_MANAGE\)/);
  assert.match(route, /allowedRoles\.has\(body\.role\)/);
  assert.match(route, /status: "PENDING"/);
  assert.match(route, /status: "ACTIVE", role: body\.role/);
  assert.match(route, /USER_ACCESS_APPROVED/);
});

test("les quatre rôles validés restent les seuls choix et seul DIRECTION possède users.manage", async () => {
  const route = await readFile("app/api/users/[id]/approve/route.js", "utf8");
  for (const role of ["BASIC_USER", "MAINTENANCE_MANAGER", "INVENTORY_MANAGER", "DIRECTION"]) assert.match(route, new RegExp(role));
  const authorization = await readFile("lib/authorization.js", "utf8");
  const nonDirection = authorization.slice(authorization.indexOf("INVENTORY_MANAGER:"), authorization.indexOf("export class AppAuthorizationError"));
  assert.doesNotMatch(nonDirection, /USERS_MANAGE/);
});

test("l'interface DIRECTION liste les demandes sans rôle présélectionné", async () => {
  const manager = await readFile("app/users/user-manager.js", "utf8");
  assert.match(manager, /Demandes en attente/);
  assert.match(manager, /<option value="">Choisir un rôle<\/option>/);
  assert.match(manager, /\/approve/);
  assert.match(manager, /Refuser/);
});

test("aucun secret ni service role n'entre dans le workflow d'inscription", async () => {
  const sources = await Promise.all([
    readFile("lib/supabase/signup-flow.js", "utf8"),
    readFile("app/inscription/signup-form.js", "utf8")
  ]);
  for (const source of sources) {
    assert.doesNotMatch(source, /service.role|SUPABASE_SERVICE_ROLE|access_token|refresh_token|Authorization/i);
  }
});

test("les trois schémas déclarent PENDING et externalAuthId unique", async () => {
  for (const file of ["prisma/schema.prisma", "prisma/postgresql/schema.prisma", "prisma/postgresql-recipe/schema.prisma"]) {
    const schema = await readFile(file, "utf8");
    assert.match(schema, /enum UserStatus\s*{\s*PENDING\s+ACTIVE\s+DISABLED/);
    assert.match(schema, /externalAuthId\s+String\?\s+@unique/);
  }
});

test("les migrations PENDING sont additives et ciblent leur seul schéma", async () => {
  const production = await readFile("prisma/postgresql/migrations/20260807090000_add_pending_user_access_requests/migration.sql", "utf8");
  const recipe = await readFile("prisma/postgresql-recipe/migrations/20260807090000_add_pending_user_access_requests/migration.sql", "utf8");
  assert.match(production, /ALTER TYPE "immos"\."UserStatus" ADD VALUE IF NOT EXISTS 'PENDING'/);
  assert.doesNotMatch(production, /immos_recipe_phase8/);
  assert.match(recipe, /ALTER TYPE "immos_recipe_phase8"\."UserStatus" ADD VALUE IF NOT EXISTS 'PENDING'/);
  assert.doesNotMatch(recipe, /"immos"\./);
  for (const sql of [production, recipe]) {
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "users_external_auth_id_key"/);
    assert.doesNotMatch(sql, /\b(?:DROP|INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  }
});

test("l'exécuteur Production est en inspection par défaut et limite ses mutations", async () => {
  const source = await readFile("scripts/apply-production-pending-migration.mjs", "utf8");
  assert.match(source, /APPLY_PENDING_TO_IMMOS_PRODUCTION/);
  assert.match(source, /mode: "INSPECT"/);
  assert.match(source, /SET TRANSACTION READ ONLY/);
  assert.match(source, /current_schema\(\).*immos/s);
  assert.match(source, /ALTER TYPE \"immos\"\.\"UserStatus\" ADD VALUE IF NOT EXISTS 'PENDING'/);
  assert.match(source, /CREATE UNIQUE INDEX IF NOT EXISTS \"users_external_auth_id_key\"/);
  assert.doesNotMatch(source, /\b(?:DROP|INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  assert.doesNotMatch(source, /immos_recipe_phase8/);
});
