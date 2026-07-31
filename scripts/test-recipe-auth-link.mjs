import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRecipeConnectionUrl,
  executeRecipeAuthLink,
  parseRecipeAuthLinkArguments,
  planRecipeAuthLink
} from "./manage-recipe-auth-link.mjs";

const AUTH_ID = "11111111-1111-4111-8111-111111111111";

function prismaFixture({ target, conflicts = [], schema = "immos_recipe_phase8", updateCount = 1 }) {
  const calls = [];
  return {
    calls,
    async $queryRawUnsafe() {
      return [{ schema }];
    },
    user: {
      async findUnique() {
        return target;
      },
      async findMany() {
        return conflicts;
      },
      async updateMany(args) {
        calls.push(args);
        return { count: updateCount };
      }
    }
  };
}

function target(overrides = {}) {
  return {
    id: "recipe-user",
    role: "BASIC_USER",
    status: "ACTIVE",
    authProvider: "local-seed",
    externalAuthId: null,
    deletedAt: null,
    ...overrides
  };
}

test("la commande est dry-run sans confirmation explicite", () => {
  const parsed = parseRecipeAuthLinkArguments([
    "--action=link",
    `--auth-user-id=${AUTH_ID}`,
    "--user-id=recipe-user"
  ]);
  assert.equal(parsed.execute, false);
});

test("la confirmation exacte active EXECUTE", () => {
  const parsed = parseRecipeAuthLinkArguments([
    "--action=link",
    `--auth-user-id=${AUTH_ID}`,
    "--user-id=recipe-user",
    "--confirm=RECIPE_ONLY"
  ]);
  assert.equal(parsed.execute, true);
});

test("une connexion non PostgreSQL est refusée", () => {
  assert.throws(() => assertRecipeConnectionUrl("file:./dev.db"), /PostgreSQL/);
});

test("le schéma actif de production est refusé", async () => {
  const prisma = prismaFixture({ target: target(), schema: "immos" });
  await assert.rejects(
    planRecipeAuthLink({ prisma, action: "link", authUserId: AUTH_ID, userId: "recipe-user" }),
    /schéma actif inattendu/
  );
});

test("un UUID déjà associé ailleurs est refusé", async () => {
  const prisma = prismaFixture({ target: target(), conflicts: [{ id: "other-user" }] });
  await assert.rejects(
    planRecipeAuthLink({ prisma, action: "link", authUserId: AUTH_ID, userId: "recipe-user" }),
    /déjà associé/
  );
});

test("une cible déjà liée à un autre UUID est refusée", async () => {
  const prisma = prismaFixture({ target: target({ externalAuthId: "22222222-2222-4222-8222-222222222222" }) });
  await assert.rejects(
    planRecipeAuthLink({ prisma, action: "link", authUserId: AUTH_ID, userId: "recipe-user" }),
    /autre UUID/
  );
});

test("link ne modifie ni rôle ni statut", async () => {
  const prisma = prismaFixture({ target: target({ role: "DIRECTION" }) });
  const result = await executeRecipeAuthLink({
    prisma,
    action: "link",
    authUserId: AUTH_ID,
    userId: "recipe-user",
    restoreAuthProvider: "local-seed"
  });
  assert.equal(result.executed, true);
  assert.deepEqual(prisma.calls[0].data, {
    externalAuthId: AUTH_ID,
    authProvider: "supabase"
  });
});

test("unlink exige la liaison exacte et restaure uniquement le provider", async () => {
  const prisma = prismaFixture({
    target: target({ authProvider: "supabase", externalAuthId: AUTH_ID, role: "INVENTORY_MANAGER" })
  });
  await executeRecipeAuthLink({
    prisma,
    action: "unlink",
    authUserId: AUTH_ID,
    userId: "recipe-user",
    restoreAuthProvider: "local-seed"
  });
  assert.deepEqual(prisma.calls[0].data, {
    externalAuthId: null,
    authProvider: "local-seed"
  });
});

test("une course bloque l'écriture", async () => {
  const prisma = prismaFixture({ target: target(), updateCount: 0 });
  await assert.rejects(
    executeRecipeAuthLink({
      prisma,
      action: "link",
      authUserId: AUTH_ID,
      userId: "recipe-user",
      restoreAuthProvider: "local-seed"
    }),
    /revalidation/
  );
});
