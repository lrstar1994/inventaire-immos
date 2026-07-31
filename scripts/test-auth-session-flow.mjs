import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

const LOADER = `
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
      url: "data:text/javascript,export%20const%20NextResponse%3D%7Bnext()%7Breturn%20%7Bcookies%3A%7Bset()%7B%7D%7D%7D%7D%7D",
      shortCircuit: true
    };
  }
  return nextResolve(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(LOADER)}`);

const {
  executeLogin,
  executeLogout,
  validateLoginInput
} = await import("../lib/supabase/auth-flow.js");
const { normalizeInternalReturnPath } =
  await import("../lib/supabase/safe-redirect.js");

function form(values = {}) {
  return {
    get(name) {
      return Object.hasOwn(values, name) ? values[name] : null;
    }
  };
}

function validForm(overrides = {}) {
  return form({
    email: "person@example.invalid",
    password: "fake-password",
    returnTo: "/parc",
    ...overrides
  });
}

test("la validation refuse les champs absents, non textuels et invalides", () => {
  assert.equal(validateLoginInput(form()).valid, false);
  assert.equal(validateLoginInput(validForm({ email: "invalid" })).valid, false);
  assert.equal(validateLoginInput(validForm({ email: 42 })).valid, false);
  assert.equal(validateLoginInput(validForm({ password: 42 })).valid, false);
  assert.equal(validateLoginInput(validForm({ email: `${"a".repeat(250)}@x.test` })).valid, false);
  assert.equal(validateLoginInput(validForm({ password: "x".repeat(1025) })).valid, false);
});

test("la redirection accepte un chemin interne", () => {
  assert.equal(normalizeInternalReturnPath("/parc?tab=files#top"), "/parc?tab=files#top");
});

test("la redirection refuse les destinations externes et dangereuses", () => {
  for (const candidate of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\evil.example",
    "javascript:alert(1)",
    "/%2F%2Fevil.example",
    "/line\nbreak"
  ]) {
    assert.equal(normalizeInternalReturnPath(candidate), "/");
  }
});

test("une connexion simulée réussit sans retourner de token", async () => {
  const calls = [];
  const result = await executeLogin({
    formData: validForm(),
    client: {
      auth: {
        async signInWithPassword(credentials) {
          calls.push(credentials);
          return {
            data: {
              session: {
                access_token: "fake-access-token",
                refresh_token: "fake-refresh-token"
              }
            },
            error: null
          };
        }
      }
    }
  });
  assert.deepEqual(calls, [{
    email: "person@example.invalid",
    password: "fake-password"
  }]);
  assert.deepEqual(result, { success: true, returnTo: "/parc" });
  assert.doesNotMatch(JSON.stringify(result), /token|password/);
});

test("le cookie adapter reçoit les mises à jour produites pendant la connexion", async () => {
  const { createSupabaseServerAuthClient } =
    await import("../lib/supabase/server-client.js");
  const writes = [];
  let cookieOptions;
  const client = createSupabaseServerAuthClient({
    env: {
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_ANON_KEY: "fake-anon"
    },
    cookieStore: {
      getAll: () => [],
      set: (...args) => writes.push(args)
    },
    createClient(_url, _key, options) {
      cookieOptions = options;
      return {
        auth: {
          async signInWithPassword() {
            cookieOptions.cookies.setAll([{
              name: "sb-fake-auth",
              value: "fake-cookie",
              options: { httpOnly: true, sameSite: "lax" }
            }]);
            return { data: { session: {} }, error: null };
          }
        }
      };
    }
  });
  assert.equal((await executeLogin({ formData: validForm(), client })).success, true);
  assert.deepEqual(writes, [[
    "sb-fake-auth",
    "fake-cookie",
    { httpOnly: true, sameSite: "lax" }
  ]]);
});

test("tous les échecs utilisateur partagent le même résultat public", async () => {
  for (const error of [
    { status: 400, code: "invalid_credentials" },
    { status: 400, code: "user_not_found" },
    { status: 422, code: "email_not_confirmed" },
    { status: 403, code: "user_disabled" }
  ]) {
    const result = await executeLogin({
      formData: validForm(),
      client: {
        auth: {
          signInWithPassword: async () => ({ data: null, error })
        }
      }
    });
    assert.deepEqual(result, { success: false, code: "invalid_credentials" });
  }
});

test("une erreur réseau devient authentication_unavailable sans détail brut", async () => {
  const result = await executeLogin({
    formData: validForm(),
    client: {
      auth: {
        signInWithPassword: async () => {
          throw new Error("real-network-detail");
        }
      }
    }
  });
  assert.deepEqual(result, {
    success: false,
    code: "authentication_unavailable"
  });
  assert.doesNotMatch(JSON.stringify(result), /real-network-detail/);
});

test("la déconnexion utilise la session utilisateur et reste contrôlée", async () => {
  const scopes = [];
  const success = await executeLogout({
    client: {
      auth: {
        signOut: async (options) => {
          scopes.push(options);
          return { error: null };
        }
      }
    }
  });
  assert.deepEqual(success, { success: true, code: null });
  assert.deepEqual(scopes, [{ scope: "local" }]);

  const absent = await executeLogout({
    client: {
      auth: {
        signOut: async () => ({ error: { status: 403 } })
      }
    }
  });
  assert.deepEqual(absent, { success: false, code: "logout_unavailable" });

  const unavailable = await executeLogout({
    client: {
      auth: {
        signOut: async () => {
          throw new Error("raw-sdk-error");
        }
      }
    }
  });
  assert.deepEqual(unavailable, { success: false, code: "logout_unavailable" });
});

test("le proxy de session copie seulement les cookies fournis par le SDK", async () => {
  const { refreshSupabaseAuthCookies } =
    await import("../lib/supabase/session-refresh.js");
  const requestWrites = [];
  const responseWrites = [];
  const request = {
    cookies: {
      getAll: () => [{ name: "sb-old", value: "fake-old" }],
      set: (...args) => requestWrites.push(args)
    }
  };
  const response = { cookies: { set: (...args) => responseWrites.push(args) } };
  let getUserCalls = 0;
  const returned = await refreshSupabaseAuthCookies(request, {
    env: {
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_ANON_KEY: "fake-anon"
    },
    createResponse: () => response,
    createClient(_url, _key, options) {
      assert.deepEqual(options.cookies.getAll(), [{ name: "sb-old", value: "fake-old" }]);
      return {
        auth: {
          async getUser() {
            getUserCalls += 1;
            options.cookies.setAll([{
              name: "sb-new",
              value: "fake-new",
              options: { httpOnly: true, sameSite: "lax", secure: true }
            }]);
            return { data: { user: null }, error: null };
          }
        }
      };
    }
  });
  assert.equal(returned, response);
  assert.equal(getUserCalls, 1);
  assert.deepEqual(requestWrites, [["sb-new", "fake-new"]]);
  assert.deepEqual(responseWrites, [[
    "sb-new",
    "fake-new",
    { httpOnly: true, sameSite: "lax", secure: true }
  ]]);
});

test("l'interface de connexion reste minimale et accessible", async () => {
  const [page, component, actions, proxy] = await Promise.all([
    readFile(new URL("../app/connexion/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/connexion/login-form.js", import.meta.url), "utf8"),
    readFile(new URL("../app/connexion/actions.js", import.meta.url), "utf8"),
    readFile(new URL("../proxy.js", import.meta.url), "utf8")
  ]);
  assert.match(component, /type="email"/);
  assert.match(component, /type="password"/);
  assert.match(component, /autoComplete="email"/);
  assert.match(component, /autoComplete="current-password"/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /disabled=\{pending\}/);
  assert.doesNotMatch(
    component,
    /signUp|name="role"|name="backend"|serviceRole|access_token|refresh_token/
  );
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.doesNotMatch(page, /app_metadata|user_metadata|access_token|refresh_token/);
  assert.match(actions, /^"use server";/);
  assert.match(actions, /logoutAction/);
  assert.doesNotMatch(actions, /admin-client|service-role|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(proxy, /matcher: \["\/connexion"\]/);
});

test("les textes FR et EN sont centralisés sans inscription publique", async () => {
  const { getAuthCopy } = await import("../lib/supabase/auth-copy.js");
  const fr = getAuthCopy("fr");
  const en = getAuthCopy("en");
  assert.equal(fr.submit, "Se connecter");
  assert.equal(en.submit, "Sign in");
  assert.equal(fr.invalidCredentials, "Adresse email ou mot de passe incorrect.");
  assert.equal(en.invalidCredentials, "Incorrect email address or password.");
  assert.equal("signUp" in fr, false);
  assert.equal("signUp" in en, false);
});
