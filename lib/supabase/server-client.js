import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { SupabaseAuthConfigurationError } from "./auth-errors.js";
import { assertServerEnvironment } from "./auth-server-config.js";
import { readSupabaseServerUserAuthConfiguration } from "./auth-config.js";

function cookieAdapter(cookieStore) {
  if (!cookieStore || typeof cookieStore.getAll !== "function") {
    throw new SupabaseAuthConfigurationError(
      "Le client Supabase Auth serveur exige un cookie store Next.js."
    );
  }
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      if (typeof cookieStore.set !== "function") return;
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // Les Server Components peuvent lire les cookies sans pouvoir les
        // écrire. Le proxy de rafraîchissement possède un adaptateur inscriptible.
      }
    }
  };
}

export function createSupabaseServerAuthClient({
  cookieStore,
  env = process.env,
  createClient = createServerClient,
  runtime = globalThis
} = {}) {
  assertServerEnvironment(runtime);
  const configuration = readSupabaseServerUserAuthConfiguration(env);
  return createClient(configuration.url, configuration.anonKey, {
    cookies: cookieAdapter(cookieStore)
  });
}

export async function getSupabaseServerAuthClient({
  cookieStore,
  cookieStoreFactory = cookies,
  ...options
} = {}) {
  const resolvedCookieStore = cookieStore || await cookieStoreFactory();
  return createSupabaseServerAuthClient({ ...options, cookieStore: resolvedCookieStore });
}
