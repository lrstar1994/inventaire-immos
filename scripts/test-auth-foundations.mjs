import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

const SERVER_ONLY_LOADER = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export%20default%20undefined", shortCircuit: true };
  }
  if (specifier === "next/headers") {
    return {
      url: "data:text/javascript,export%20async%20function%20cookies()%7Bthrow%20new%20Error('cookie%20store%20not%20injected')%7D",
      shortCircuit: true
    };
  }
  return nextResolve(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(SERVER_ONLY_LOADER)}`);

const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: " https://example.invalid/ ",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: " test-anon-key "
};
const serverEnv = {
  SUPABASE_URL: "https://example.invalid",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role"
};

test("la configuration navigateur valide et normalise les variables publiques", async () => {
  const { readSupabaseBrowserAuthConfiguration } = await import("../lib/supabase/auth-config.js");
  assert.deepEqual(readSupabaseBrowserAuthConfiguration(publicEnv), {
    url: "https://example.invalid",
    anonKey: "test-anon-key"
  });
});

test("la configuration serveur accepte les noms serveur canoniques", async () => {
  const { readSupabaseServerUserAuthConfiguration } =
    await import("../lib/supabase/auth-config.js");
  assert.deepEqual(readSupabaseServerUserAuthConfiguration(serverEnv), {
    url: "https://example.invalid",
    anonKey: "test-anon-key"
  });
});

test("les variables manquantes et URL invalides produisent des erreurs sans valeur", async () => {
  const { readSupabaseBrowserAuthConfiguration } = await import("../lib/supabase/auth-config.js");
  assert.throws(() => readSupabaseBrowserAuthConfiguration({}), /NEXT_PUBLIC_SUPABASE_URL/);
  assert.throws(
    () => readSupabaseBrowserAuthConfiguration({
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "secret-that-must-not-appear"
    }),
    (error) => !error.message.includes("secret-that-must-not-appear")
  );
});

test("le client navigateur transmet seulement URL et clé publique", async () => {
  const { createSupabaseBrowserAuthClient } = await import("../lib/supabase/browser-client.js");
  const calls = [];
  const expected = {};
  assert.equal(createSupabaseBrowserAuthClient({
    env: publicEnv,
    createClient(...args) {
      calls.push(args);
      return expected;
    }
  }), expected);
  assert.deepEqual(calls, [["https://example.invalid", "test-anon-key"]]);
});

test("la factory navigateur réutilise son client", async () => {
  const { createSupabaseBrowserAuthClientFactory } =
    await import("../lib/supabase/browser-client.js");
  let count = 0;
  const getClient = createSupabaseBrowserAuthClientFactory({
    env: publicEnv,
    createClient() {
      count += 1;
      return {};
    }
  });
  assert.equal(getClient(), getClient());
  assert.equal(count, 1);
});

test("le client serveur adapte lecture et écriture des cookies", async () => {
  const { createSupabaseServerAuthClient } = await import("../lib/supabase/server-client.js");
  const writes = [];
  const cookieStore = {
    getAll: () => [{ name: "auth", value: "fake-cookie" }],
    set: (...args) => writes.push(args)
  };
  let options;
  const client = createSupabaseServerAuthClient({
    env: serverEnv,
    cookieStore,
    createClient(_url, _key, receivedOptions) {
      options = receivedOptions;
      return {};
    }
  });
  assert.deepEqual(client, {});
  assert.deepEqual(options.cookies.getAll(), [{ name: "auth", value: "fake-cookie" }]);
  options.cookies.setAll([{ name: "auth", value: "updated", options: { httpOnly: true } }]);
  assert.deepEqual(writes, [["auth", "updated", { httpOnly: true }]]);
});

test("le client serveur refuse un cookie store invalide", async () => {
  const { createSupabaseServerAuthClient } = await import("../lib/supabase/server-client.js");
  assert.throws(
    () => createSupabaseServerAuthClient({
      env: serverEnv,
      cookieStore: {},
      createClient() {}
    }),
    /cookie store/
  );
});

test("le client service-role reste server-only et désactive les sessions", async () => {
  const { createSupabaseAdminAuthClient } = await import("../lib/supabase/admin-client.js");
  let call;
  const expected = {};
  assert.equal(createSupabaseAdminAuthClient({
    env: serverEnv,
    createAdminClient(...args) {
      call = args;
      return expected;
    }
  }), expected);
  assert.equal(call[0], "https://example.invalid");
  assert.equal(call[1], "test-service-role");
  assert.deepEqual(call[2], {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
});

test("le service-role est obligatoire et le navigateur simulé est refusé", async () => {
  const { createSupabaseAdminAuthClient } = await import("../lib/supabase/admin-client.js");
  assert.throws(
    () => createSupabaseAdminAuthClient({
      env: { SUPABASE_URL: "https://example.invalid", SUPABASE_ANON_KEY: "anon" },
      createAdminClient() {}
    }),
    /SUPABASE_SERVICE_ROLE_KEY/
  );
  assert.throws(
    () => createSupabaseAdminAuthClient({
      env: serverEnv,
      runtime: { window: {} },
      createAdminClient() {}
    }),
    /reserve au serveur/
  );
});

test("les helpers retournent session et utilisateur sans rôle métier", async () => {
  const { getCurrentSession, getCurrentUser, refreshSession } =
    await import("../lib/supabase/session.js");
  const session = { access_token: "fake-access-token" };
  const user = { id: "fake-user" };
  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user }, error: null }),
      refreshSession: async () => ({ data: { session }, error: null })
    }
  };
  assert.equal(await getCurrentSession({ client }), session);
  assert.equal(await getCurrentUser({ client }), user);
  assert.equal(await refreshSession({ client }), session);
  assert.equal("role" in user, false);
});

test("les helpers acceptent une session absente et normalisent les erreurs", async () => {
  const { getCurrentSession, getCurrentUser, refreshSession } =
    await import("../lib/supabase/session.js");
  assert.equal(await getCurrentSession({
    client: { auth: { getSession: async () => ({ data: { session: null }, error: null }) } }
  }), null);
  assert.equal(await getCurrentUser({
    client: { auth: { getUser: async () => ({ data: { user: null }, error: null }) } }
  }), null);
  await assert.rejects(
    refreshSession({
      client: {
        auth: {
          refreshSession: async () => ({
            data: null,
            error: new Error("raw-sensitive-sdk-error")
          })
        }
      }
    }),
    (error) =>
      error.code === "session_refresh_failed" &&
      !error.message.includes("raw-sensitive-sdk-error")
  );
});

test("l'absence réelle de cookie Auth est distinguée d'une indisponibilité", async () => {
  const { getCurrentSession, getCurrentUser } =
    await import("../lib/supabase/session.js");
  const missingSessionError = { name: "AuthSessionMissingError", status: 400 };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: missingSessionError }),
      getUser: async () => ({ data: { user: null }, error: missingSessionError })
    }
  };
  assert.equal(await getCurrentSession({ client }), null);
  assert.equal(await getCurrentUser({ client }), null);
});

test("la frontière client ne référence ni service-role ni module privilégié", async () => {
  const [browserSource, adminSource, serverSource] = await Promise.all([
    readFile(new URL("../lib/supabase/browser-client.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase/admin-client.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase/server-client.js", import.meta.url), "utf8")
  ]);
  assert.doesNotMatch(browserSource, /SUPABASE_SERVICE_ROLE_KEY|admin-client|auth-server-config/);
  assert.match(adminSource, /^import "server-only";/);
  assert.match(serverSource, /^import "server-only";/);
});
