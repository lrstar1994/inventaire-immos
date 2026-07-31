export default function AccessDenied({ status = "not_authorized" }) {
  const inactive = status === "inactive";
  const unavailable = status.endsWith("_unavailable");
  return (
    <main className="shell">
      <section className="panel" aria-labelledby="access-denied-title">
        <p className="eyebrow">Inventaire Immos</p>
        <h1 id="access-denied-title">
          {inactive
            ? "Accès désactivé"
            : unavailable
              ? "Autorisation temporairement indisponible"
              : "Accès non autorisé"}
        </h1>
        <p>
          {unavailable
            ? "Inventaire Immos ne peut pas vérifier votre autorisation pour le moment."
            : inactive
            ? "Votre accès à Inventaire Immos est désactivé."
            : "Votre compte Supabase est connecté, mais il ne dispose d’aucun accès à Inventaire Immos."}
        </p>
        <p>Vous restez connecté aux autres applications utilisant ce compte.</p>
      </section>
    </main>
  );
}
