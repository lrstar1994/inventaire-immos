import { refreshSupabaseAuthCookies } from "@/lib/supabase/session-refresh";

export async function proxy(request) {
  return refreshSupabaseAuthCookies(request);
}

export const config = {
  matcher: ["/connexion"]
};
