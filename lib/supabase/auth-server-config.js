import "server-only";

import { SupabaseAuthConfigurationError } from "./auth-errors.js";
import { readSupabaseServerUserAuthConfiguration } from "./auth-config.js";

export function assertServerEnvironment(runtime = globalThis) {
  if (runtime && typeof runtime.window !== "undefined") {
    throw new SupabaseAuthConfigurationError(
      "Le client Supabase Auth privilegie est reserve au serveur."
    );
  }
}

export function readSupabaseAdminAuthConfiguration(env = process.env, runtime = globalThis) {
  assertServerEnvironment(runtime);
  const userConfiguration = readSupabaseServerUserAuthConfiguration(env);
  const serviceRoleKey = String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!serviceRoleKey) {
    throw new SupabaseAuthConfigurationError(
      "Configuration Supabase Auth manquante : SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  if (/[\r\n]/.test(serviceRoleKey)) {
    throw new SupabaseAuthConfigurationError(
      "Configuration Supabase Auth invalide : SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return Object.freeze({ ...userConfiguration, serviceRoleKey });
}
