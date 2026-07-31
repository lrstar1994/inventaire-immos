import assert from "node:assert/strict";

import { createServerClient } from "@supabase/ssr";
import { PrismaClient } from "../generated/prisma-recipe/index.js";

import { loadSupabaseEnv } from "./supabase-env.mjs";
import { executeRecipeAuthLink } from "./manage-recipe-auth-link.mjs";

const BASE_URL = "http://127.0.0.1:3000";
const RECIPE_SCHEMA = "immos_recipe_phase8";
const REDIRECT_STATUSES = Object.freeze([302, 303, 307, 308]);
const TARGETS = Object.freeze([
  { role: "BASIC_USER", userId: "cmpu6f8nx0003w0xobw0x2vof" },
  { role: "MAINTENANCE_MANAGER", userId: "cmpu6f8mp0002w0xohfrgmv1w" },
  { role: "INVENTORY_MANAGER", userId: "cmpu6f8m90001w0xogklkoasb" },
  { role: "DIRECTION", userId: "cmpu6f8l00000w0xof7oikpri" }
]);

function cookieJarClient(env) {
  const jar = new Map();
  const client = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return [...jar].map(([name, value]) => ({ name, value }));
        },
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
    cookieHeader() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    cookieCount() {
      return jar.size;
    }
  };
}

async function request(pathname, cookieHeader = "", options = {}) {
  return fetch(`${BASE_URL}${pathname}`, {
    redirect: "manual",
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {})
    }
  });
}

async function status(pathname, cookieHeader, options) {
  const response = await request(pathname, cookieHeader, options);
  await response.arrayBuffer();
  return response.status;
}

async function main() {
  const env = await loadSupabaseEnv();
  const authUserId = env.AUTH_RECIPE_TEST_USER_ID;
  const email = env.AUTH_RECIPE_TEST_EMAIL;
  const password = env.AUTH_RECIPE_TEST_PASSWORD;
  assert.match(authUserId || "", /^[0-9a-f-]{36}$/i);
  assert.ok(email && password, "Identifiants Auth de recette absents.");

  const recipeUrl = new URL(env.SUPABASE_DIRECT_URL);
  recipeUrl.searchParams.set("schema", RECIPE_SCHEMA);
  const prisma = new PrismaClient({
    datasourceUrl: recipeUrl.toString(),
    errorFormat: "minimal"
  });
  const originals = new Map();
  const results = {};

  try {
    const [schema] = await prisma.$queryRawUnsafe("SELECT current_schema() AS schema");
    assert.equal(schema.schema, RECIPE_SCHEMA);
    const targets = await prisma.user.findMany({
      where: { id: { in: TARGETS.map((target) => target.userId) } },
      select: {
        id: true,
        role: true,
        status: true,
        deletedAt: true,
        authProvider: true,
        externalAuthId: true
      }
    });
    assert.equal(targets.length, TARGETS.length);
    for (const expected of TARGETS) {
      const target = targets.find((row) => row.id === expected.userId);
      assert.equal(target.role, expected.role);
      assert.equal(target.status, "ACTIVE");
      assert.equal(target.deletedAt, null);
      assert.equal(target.externalAuthId, null);
      originals.set(target.id, target.authProvider);
    }
    assert.equal(
      await prisma.user.count({ where: { externalAuthId: authUserId } }),
      0,
      "Le compte Auth possède déjà une liaison applicative."
    );

    const unauthenticated = await request("/", "");
    assert.ok(REDIRECT_STATUSES.includes(unauthenticated.status));
    assert.match(unauthenticated.headers.get("location") || "", /^\/connexion\?returnTo=/);
    const loginPage = await request(unauthenticated.headers.get("location"), "");
    assert.equal(loginPage.status, 200);
    assert.match(await loginPage.text(), /Connexion/);
    results.unauthenticated = "redirected_to_login";

    const auth = cookieJarClient(env);
    const login = await auth.client.auth.signInWithPassword({ email, password });
    assert.equal(login.error, null, "Connexion Auth réelle refusée.");
    assert.ok(auth.cookieCount() > 0, "Cookies Auth absents après connexion.");
    const verified = await auth.client.auth.getUser();
    assert.equal(verified.error, null);
    assert.equal(verified.data.user?.id, authUserId);

    const denied = await request("/", auth.cookieHeader());
    assert.equal(denied.status, 200);
    assert.match(await denied.text(), /Acc.s non autoris/);
    assert.equal(await prisma.user.count({ where: { externalAuthId: authUserId } }), 0);
    results.authenticatedWithoutMembership = "denied_without_auto_assignment";

    for (const target of TARGETS) {
      await executeRecipeAuthLink({
        prisma,
        action: "link",
        authUserId,
        userId: target.userId,
        restoreAuthProvider: originals.get(target.userId)
      });
      assert.equal(await prisma.user.count({ where: { externalAuthId: authUserId } }), 1);

      const page = await request("/", auth.cookieHeader());
      assert.equal(page.status, 200);
      const pageText = await page.text();
      assert.doesNotMatch(pageText, /Acc.s non autoris/);
      assert.match(pageText, /D.connexion/);

      const roleResult = { page: 200 };
      if (target.role === "BASIC_USER") {
        roleResult.read = await status("/api/asset-units", auth.cookieHeader());
        roleResult.write = await status("/api/asset-units", auth.cookieHeader(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}"
        });
        roleResult.users = await status("/api/users", auth.cookieHeader());
        roleResult.roles = await status("/api/roles", auth.cookieHeader());
        assert.deepEqual(roleResult, { page: 200, read: 200, write: 403, users: 403, roles: 403 });
      } else if (target.role === "MAINTENANCE_MANAGER") {
        roleResult.read = await status("/api/asset-movements", auth.cookieHeader());
        roleResult.allowedMutationReachedValidation = await status(
          "/api/asset-movements",
          auth.cookieHeader(),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}"
          }
        );
        roleResult.assetWrite = await status("/api/asset-units", auth.cookieHeader(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}"
        });
        roleResult.users = await status("/api/users", auth.cookieHeader());
        assert.deepEqual(roleResult, {
          page: 200,
          read: 200,
          allowedMutationReachedValidation: 400,
          assetWrite: 403,
          users: 403
        });
      } else if (target.role === "INVENTORY_MANAGER") {
        roleResult.read = await status("/api/asset-units", auth.cookieHeader());
        roleResult.allowedMutationReachedValidation = await status(
          "/api/asset-units",
          auth.cookieHeader(),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}"
          }
        );
        roleResult.users = await status("/api/users", auth.cookieHeader());
        roleResult.roles = await status("/api/roles", auth.cookieHeader());
        assert.deepEqual(roleResult, {
          page: 200,
          read: 200,
          allowedMutationReachedValidation: 400,
          users: 403,
          roles: 403
        });
      } else {
        roleResult.users = await status("/api/users", auth.cookieHeader());
        roleResult.roles = await status("/api/roles", auth.cookieHeader());
        assert.deepEqual(roleResult, { page: 200, users: 200, roles: 200 });

        const refresh = await request("/", auth.cookieHeader());
        assert.equal(refresh.status, 200);
        assert.match(await refresh.text(), /D.connexion/);
        results.sessionRefresh = "recognized_after_reload";

        const logout = await auth.client.auth.signOut({ scope: "local" });
        assert.equal(logout.error, null);
        const afterLogout = await request("/", auth.cookieHeader());
        assert.ok(REDIRECT_STATUSES.includes(afterLogout.status));
        assert.match(afterLogout.headers.get("location") || "", /^\/connexion\?returnTo=/);
        const afterLogoutLoginPage = await request(afterLogout.headers.get("location"), auth.cookieHeader());
        assert.equal(afterLogoutLoginPage.status, 200);
        assert.doesNotMatch(await afterLogoutLoginPage.text(), /data-auth-state="authenticated"/);
        results.logout = "session_cleared_and_private_page_refused";
      }

      results[target.role] = roleResult;
      await executeRecipeAuthLink({
        prisma,
        action: "unlink",
        authUserId,
        userId: target.userId,
        restoreAuthProvider: originals.get(target.userId)
      });
      assert.equal(await prisma.user.count({ where: { externalAuthId: authUserId } }), 0);
    }
  } finally {
    for (const target of TARGETS) {
      const current = await prisma.user.findUnique({
        where: { id: target.userId },
        select: { externalAuthId: true, authProvider: true }
      });
      if (current?.externalAuthId === authUserId) {
        const cleanup = await prisma.user.updateMany({
          where: {
            id: target.userId,
            externalAuthId: authUserId,
            authProvider: "supabase"
          },
          data: {
            externalAuthId: null,
            authProvider: originals.get(target.userId) || "local-seed"
          }
        });
        assert.equal(cleanup.count, 1, "Nettoyage de liaison incomplet.");
      }
    }
    assert.equal(await prisma.user.count({ where: { externalAuthId: authUserId } }), 0);
    await prisma.$disconnect();
  }

  console.log(JSON.stringify({
    result: "RECIPE_AUTHORIZATION_LIVE_OK",
    scenarios: results,
    temporaryMembershipsRemaining: 0,
    secretsLogged: false
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Validation réelle échouée.");
  process.exitCode = 1;
});
