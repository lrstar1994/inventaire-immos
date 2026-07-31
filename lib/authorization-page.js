import "server-only";

import { redirect } from "next/navigation";

import {
  AppAuthorizationError,
  getCurrentAppUser
} from "@/lib/authorization";
import { normalizeInternalReturnPath } from "@/lib/supabase/safe-redirect";

export async function authorizePrivatePage({
  returnTo = "/",
  ...options
} = {}) {
  let result;
  try {
    result = await getCurrentAppUser(options);
  } catch (error) {
    if (error instanceof AppAuthorizationError) {
      return { status: error.code, user: null };
    }
    throw error;
  }
  if (result.status === "unauthenticated") {
    const safeReturnTo = normalizeInternalReturnPath(returnTo);
    redirect(`/connexion?returnTo=${encodeURIComponent(safeReturnTo)}`);
  }
  return result;
}
