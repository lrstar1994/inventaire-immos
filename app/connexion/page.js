import Link from "next/link";
import LoginForm from "./login-form";
import { logoutAction } from "./actions";
import { getAuthCopy, normalizeAuthLocale } from "@/lib/supabase/auth-copy";
import { normalizeInternalReturnPath } from "@/lib/supabase/safe-redirect";
import { getCurrentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Connexion — Inventaire Immos"
};

export default async function LoginPage({ searchParams }) {
  const query = await searchParams;
  const locale = normalizeAuthLocale(query?.lang);
  const copy = getAuthCopy(locale);
  const returnTo = normalizeInternalReturnPath(query?.returnTo);
  let user = null;
  let authUnavailable = false;

  try {
    user = await getCurrentUser();
  } catch {
    authUnavailable = true;
  }

  return (
    <main className="shell auth-shell" lang={locale}>
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">Supabase Auth</p>
        <h1 id="auth-title">{copy.title}</h1>
        {user ? (
          <div className="auth-session" data-auth-state="authenticated">
            <strong>{copy.alreadyConnected}</strong>
            {user.email ? <p>{copy.connectedAs} {user.email}</p> : null}
            <form action={logoutAction}>
              <input name="locale" type="hidden" value={locale} />
              <button className="button" type="submit">{copy.logout}</button>
            </form>
          </div>
        ) : (
          <>
            {query?.status === "signed-out" ? (
              <p aria-live="polite" className="auth-notice">{copy.signedOut}</p>
            ) : null}
            {authUnavailable || query?.status === "logout-unavailable" ? (
              <p aria-live="polite" className="auth-error" role="alert">
                {copy.unavailable}
              </p>
            ) : null}
            <LoginForm copy={copy} locale={locale} returnTo={returnTo} />
            <p className="auth-switch">
              Nouveau collaborateur ? <Link href={`/inscription?returnTo=${encodeURIComponent(returnTo)}`}>Créer un compte</Link>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
