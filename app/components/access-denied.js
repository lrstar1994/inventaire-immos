import { logoutAction } from "@/app/connexion/actions";

export default function AccessDenied({ status = "not_authorized" }) {
  const inactive = status === "inactive";
  const pending = status === "pending";
  const unavailable = status.endsWith("_unavailable");
  return (
    <main className="shell">
      <section className="panel" aria-labelledby="access-denied-title">
        <p className="eyebrow">Inventaire Immos</p>
        <h1 id="access-denied-title">
          {pending
            ? "Demande d’accès en attente"
            : inactive
            ? "Accès désactivé"
            : unavailable
              ? "Autorisation temporairement indisponible"
              : "Accès non autorisé"}
        </h1>
        <p>
          {pending
            ? "Votre compte est bien créé. Votre demande d’accès à Inventaire Immos doit encore être validée par la Direction."
            : unavailable
            ? "Inventaire Immos ne peut pas vérifier votre autorisation pour le moment."
            : inactive
            ? "Votre accès à Inventaire Immos est désactivé."
            : "Votre compte Supabase est connecté, mais il ne dispose d’aucun accès à Inventaire Immos."}
        </p>
        <p>{pending ? "Vous pouvez vous déconnecter et revenir plus tard." : "Vous restez connecté aux autres applications utilisant ce compte."}</p>
        {pending ? (
          <form action={logoutAction}>
            <input name="locale" type="hidden" value="fr" />
            <button type="submit">Déconnexion</button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
