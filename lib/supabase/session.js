import "server-only";

import { SupabaseAuthOperationError } from "./auth-errors.js";
import { getSupabaseServerAuthClient } from "./server-client.js";

async function resolveClient(client, clientFactory) {
  return client || clientFactory();
}

function operationFailure(code, operation) {
  return new SupabaseAuthOperationError(
    code,
    `Operation Supabase Auth impossible : ${operation}.`
  );
}

function isMissingAuthSession(error) {
  return error?.name === "AuthSessionMissingError";
}

export async function getCurrentSession({
  client,
  clientFactory = getSupabaseServerAuthClient
} = {}) {
  const authClient = await resolveClient(client, clientFactory);
  const { data, error } = await authClient.auth.getSession();
  if (isMissingAuthSession(error)) return null;
  if (error) throw operationFailure("session_read_failed", "lecture de session");
  return data?.session ?? null;
}

export async function getCurrentUser({
  client,
  clientFactory = getSupabaseServerAuthClient
} = {}) {
  const authClient = await resolveClient(client, clientFactory);
  const { data, error } = await authClient.auth.getUser();
  if (isMissingAuthSession(error)) return null;
  if (error) throw operationFailure("user_read_failed", "lecture de l'utilisateur");
  return data?.user ?? null;
}

export async function refreshSession({
  client,
  clientFactory = getSupabaseServerAuthClient
} = {}) {
  const authClient = await resolveClient(client, clientFactory);
  const { data, error } = await authClient.auth.refreshSession();
  if (error) throw operationFailure("session_refresh_failed", "rafraichissement de session");
  return data?.session ?? null;
}
