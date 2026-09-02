import Link from "next/link";
import AccessDenied from "@/app/components/access-denied";
import { authorizePrivatePage } from "@/lib/authorization-page";
import { computeAssetEntryProgress } from "@/lib/asset-service";
import { prisma } from "@/lib/prisma";
import EntryWorkflowStepper from "../entry-workflow-stepper";

export const metadata = { title: "Entrées en cours | Inventaire Immos" };
export const dynamic = "force-dynamic";

function progressLabel(progress) {
  if (progress.readyToValidate) return { label: "Prêt à valider", tone: "ready" };
  if (!progress.identification) return { label: "Identification à compléter", tone: "warning" };
  if (!progress.assignment) return { label: "Affectation à compléter", tone: "warning" };
  if (!progress.photosDocuments) return { label: "Photos à faire", tone: "pending" };
  if (!progress.finances) return { label: "Finances à compléter", tone: "pending" };
  return { label: "À compléter", tone: "warning" };
}

export default async function DraftEntriesPage() {
  const access = await authorizePrivatePage({ returnTo: "/parc/entrees-en-cours" });
  if (access.status !== "authorized") return <AccessDenied status={access.status} />;
  const entries = await prisma.assetEntry.findMany({
    where: { entryStatus: "DRAFT" },
    select: { id: true, entryNumber: true, quantity: true, updatedAt: true, assetItemId: true, locationId: true, entryType: true, entryDate: true, initialCondition: true, initialStatus: true, supplierKnown: true, purchaseDateKnown: true, priceKnown: true, invoiceAvailable: true, assetItem: { select: { name: true, code: true, category: { select: { trackingMode: true } } } }, location: { select: { name: true } }, _count: { select: { assetFiles: { where: { deletedAt: null } } } } },
    orderBy: { updatedAt: "desc" }, take: 100
  });
  return <main className="shell park-shell entry-ui-screen">
    <div className="section-heading park-heading wizard-heading ui-page-heading"><div><h1>Entrées en cours</h1><p className="summary">Reprenez une saisie commencée ou créez une nouvelle entrée.</p></div><div className="hero-actions"><Link className="button" href="/parc/nouvelle-entree">＋ Nouvelle entrée</Link><span className="button secondary ui-static-action">▣ Brouillons seulement</span></div></div>
    <EntryWorkflowStepper active={2} />
    <section className="panel draft-list-panel">
      <div className="draft-list-filters"><label className="ui-search-field"><span>⌕</span><input aria-label="Rechercher une entrée" placeholder="Rechercher une entrée…" /></label><span className="ui-filter-chip">▽ Statut</span><span className="ui-filter-chip muted">Agent non disponible</span><span className="ui-filter-chip">▣ Date</span></div>
      {entries.length ? <div className="table-wrap draft-table-wrap"><table className="draft-table"><thead><tr><th>Numéro</th><th>Article / modèle</th><th>Emplacement</th><th>Avancement</th><th>Dernière mise à jour</th><th>Statut</th><th>Action</th></tr></thead><tbody>{entries.map((entry) => { const progress = computeAssetEntryProgress(entry); const advance = progressLabel(progress); return <tr key={entry.id}><td><strong>{entry.entryNumber}</strong><small>{entry.assetItem.category?.trackingMode || ""}</small></td><td>{entry.assetItem.name}</td><td>{entry.location?.name || "À compléter"}</td><td><span className={`progress-pill ${advance.tone}`}><i />{advance.label}</span></td><td>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(entry.updatedAt)}</td><td><span className={`draft-status ${progress.readyToValidate ? "ready" : progress.identification && progress.assignment ? "warning" : "neutral"}`}>{progress.readyToValidate ? "Prêt à valider" : progress.identification && progress.assignment ? "À compléter" : "Brouillon"}</span></td><td><div className="draft-row-actions"><Link className="button" href={`/parc/entries/${entry.id}`}>Continuer</Link><span aria-hidden="true" className="more-button">⋮</span></div></td></tr>; })}</tbody></table></div> : <div className="empty-state"><h2>Aucune entrée en cours.</h2><p>Vous pouvez créer une nouvelle entrée ou revenir au parc.</p><div className="form-actions"><Link className="button" href="/parc/nouvelle-entree">Nouvelle entrée</Link><Link className="button secondary" href="/parc">Retour au parc</Link></div></div>}
    </section>
    <aside className="panel why-drafts"><div className="why-icon">▤</div><div><h2>Pourquoi cette liste ?</h2><ul><li>Reprendre plus tard une saisie commencée sans perte de données.</li><li>Éviter de recommencer en cas de coupure ou d'interruption.</li><li>Répartir le travail entre terrain et bureau en toute fluidité.</li></ul></div></aside>
  </main>;
}
