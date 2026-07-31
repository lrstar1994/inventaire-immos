import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

import { readSupabaseServerUserAuthConfiguration } from "./auth-config.js";

export async function refreshSupabaseAuthCookies(
  request,
  {
    env = process.env,
    createClient = createServerClient,
    createResponse = () => NextResponse.next({ request })
  } = {}
) {
  const configuration = readSupabaseServerUserAuthConfiguration(env);
  let response = createResponse();
  const client = createClient(configuration.url, configuration.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = createResponse();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      }
    }
  });

  // getUser valide le jeton auprès d'Auth et permet au SDK SSR de renouveler
  // les cookies si nécessaire. Aucune donnée utilisateur n'est sérialisée.
  await client.auth.getUser();
  return response;
}
