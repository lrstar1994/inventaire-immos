import "server-only";

import { createClient } from "@supabase/supabase-js";

import { readSupabaseAdminAuthConfiguration } from "./auth-server-config.js";

export function createSupabaseAdminAuthClient({
  env = process.env,
  createAdminClient = createClient,
  runtime = globalThis
} = {}) {
  const configuration = readSupabaseAdminAuthConfiguration(env, runtime);
  return createAdminClient(configuration.url, configuration.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export function createSupabaseAdminAuthClientFactory(options = {}) {
  let client;
  return function getSupabaseAdminAuthClient() {
    client ||= createSupabaseAdminAuthClient(options);
    return client;
  };
}
