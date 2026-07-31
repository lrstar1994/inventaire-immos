"use server";

import { redirect } from "next/navigation";

import { executeLogin, executeLogout } from "@/lib/supabase/auth-flow";
import { normalizeAuthLocale } from "@/lib/supabase/auth-copy";

export async function loginAction(_previousState, formData) {
  const result = await executeLogin({ formData });
  if (result.success) redirect(result.returnTo);
  return result;
}

export async function logoutAction(formData) {
  const localeValue = formData?.get?.("locale");
  const locale = normalizeAuthLocale(
    typeof localeValue === "string" ? localeValue : "fr"
  );
  const result = await executeLogout();
  const status = result.success ? "signed-out" : "logout-unavailable";
  redirect(`/connexion?lang=${locale}&status=${status}`);
}
