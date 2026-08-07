import Link from "next/link";

import { normalizeInternalReturnPath } from "@/lib/supabase/safe-redirect";

import SignupForm from "./signup-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Créer un compte — Inventaire Immos" };

export default async function SignupPage({ searchParams }) {
  const query = await searchParams;
  const returnTo = normalizeInternalReturnPath(query?.returnTo);
  return (
    <main className="shell auth-shell">
      <section className="auth-card" aria-labelledby="signup-title">
        <p className="eyebrow">Inventaire Immos</p>
        <h1 id="signup-title">Créer un compte</h1>
        <p>Votre demande devra être validée par la Direction avant tout accès métier.</p>
        <SignupForm returnTo={returnTo} />
        <p className="auth-switch">Déjà inscrit ? <Link href="/connexion">Se connecter</Link></p>
      </section>
    </main>
  );
}
