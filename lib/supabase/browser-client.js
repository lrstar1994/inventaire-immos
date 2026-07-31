import { createBrowserClient } from "@supabase/ssr";

import { readSupabaseBrowserAuthConfiguration } from "./auth-config.js";

function publicEnvironment() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  };
}

export function createSupabaseBrowserAuthClient({
  env = publicEnvironment(),
  createClient = createBrowserClient
} = {}) {
  const configuration = readSupabaseBrowserAuthConfiguration(env);
  return createClient(configuration.url, configuration.anonKey);
}

export function createSupabaseBrowserAuthClientFactory(options = {}) {
  let client;
  return function getSupabaseBrowserAuthClient() {
    client ||= createSupabaseBrowserAuthClient(options);
    return client;
  };
}
