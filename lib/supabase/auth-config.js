import { SupabaseAuthConfigurationError } from "./auth-errors.js";

function requiredValue(env, names) {
  for (const name of names) {
    const value = String(env?.[name] || "").trim();
    if (value) return value;
  }
  throw new SupabaseAuthConfigurationError(
    `Configuration Supabase Auth manquante : ${names.join(" ou ")}.`
  );
}

function normalizeUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new SupabaseAuthConfigurationError(
      "Configuration Supabase Auth invalide : SUPABASE_URL doit etre une URL HTTP(S)."
    );
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new SupabaseAuthConfigurationError(
      "Configuration Supabase Auth invalide : SUPABASE_URL doit etre une URL HTTP(S) sans identifiants."
    );
  }
  return value.replace(/\/+$/, "");
}

function normalizePublicKey(value) {
  if (/[\r\n]/.test(value)) {
    throw new SupabaseAuthConfigurationError(
      "Configuration Supabase Auth invalide : SUPABASE_ANON_KEY."
    );
  }
  return value;
}

export function readSupabaseBrowserAuthConfiguration(env = process.env) {
  return Object.freeze({
    url: normalizeUrl(requiredValue(env, ["NEXT_PUBLIC_SUPABASE_URL"])),
    anonKey: normalizePublicKey(requiredValue(env, ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]))
  });
}

export function readSupabaseServerUserAuthConfiguration(env = process.env) {
  return Object.freeze({
    url: normalizeUrl(requiredValue(env, ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"])),
    anonKey: normalizePublicKey(
      requiredValue(env, ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"])
    )
  });
}
