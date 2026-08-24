import Link from "next/link";
import AccessDenied from "@/app/components/access-denied";
import { authorizePrivatePage } from "@/lib/authorization-page";
import { computeAssetEntryProgress } from "@/lib/asset-service";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Entrées en cours | Inventaire Immos" };
export const dynamic = "force-dynamic";

function Progress({ progress }) {
  return <div className="draft-progress"><span>Identification : {progress.identification ? "complète" : "à compléter"}</span><span>Affectation : {progress.assignment ? "complète" : "à compléter"}</span><span>Photos/documents : {progress.photosDocuments || "à compléter"}</span><span>Finances : {progress.finances ? "renseignées" : "à compléter"}</span><strong>{progress.readyToValidate ? "Prêt à valider" : "À compléter"}</strong></div>;
}

export default async function DraftEntriesPage() {
  const access = await authorizePrivatePage({ returnTo: "/parc/entrees-en-cours" });
  if (access.status !== "authorized") return <AccessDenied status={access.status} />;
  const entries = await prisma.assetEntry.findMany({
    where: { entryStatus: "DRAFT" },
    select: { id: true, entryNumber: true, quantity: true, updatedAt: true, assetItemId: true, locationId: true, entryType: true, entryDate: true, initialCondition: true, initialStatus: true, supplierKnown: true, purchaseDateKnown: true, priceKnown: true, invoiceAvailable: true, assetItem: { select: { name: true, code: true, category: { select: { trackingMode: true } } } }, location: { select: { name: true } }, _count: { select: { assetFiles: { where: { deletedAt: null } } } } },
    orderBy: { updatedAt: "desc" }, take: 100
  });
  return <main className="shell park-shell"><div className="section-heading park-heading wizard-heading"><div><p className="eyebrow">Reprendre une saisie</p><h1>Entrées en cours</h1><p className="summary">Brouillons enregistrés sans effet patrimonial.</p></div><div className="hero-actions"><Link className="button" href="/parc/nouvelle-entree">Nouvelle entrée</Link><Link className="button secondary" href="/parc">Retour au parc</Link></div></div><section className="draft-card-grid">{entries.map((entry) => { const progress = computeAssetEntryProgress(entry); return <article className="panel draft-card" key={entry.id}><div><span className="status-pill">Brouillon · {entry.assetItem.category?.trackingMode}</span><h2>{entry.entryNumber}</h2><strong>{entry.assetItem.name}</strong><p>{entry.location?.name || "Emplacement à compléter"} · Quantité {entry.quantity}</p></div><Progress progress={progress} /><p className="summary">Dernière modification : {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(entry.updatedAt)}</p><Link className="button" href={`/parc/entries/${entry.id}`}>Continuer</Link></article>; })}{!entries.length ? <article className="panel empty-state"><h2>Aucune entrée en cours</h2><p>Vous pouvez créer une nouvelle entrée ou revenir au parc.</p><div className="form-actions"><Link className="button" href="/parc/nouvelle-entree">Nouvelle entrée</Link><Link className="button secondary" href="/parc">Retour au parc</Link></div></article> : null}</section></main>;
}
