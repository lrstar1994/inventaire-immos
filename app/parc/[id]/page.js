import Link from "next/link";
import AssetUnitDetail from "./asset-unit-detail";

export const metadata = {
  title: "Fiche bien | Inventaire Immos"
};

export default async function AssetUnitPage({ params }) {
  const { id } = await params;

  return (
    <main className="shell asset-unit-shell">
      <div className="section-heading park-heading asset-unit-heading">
        <div>
          <p className="eyebrow">Parc physique</p>
          <h1>Fiche bien</h1>
          <p className="summary">Consultation complete, tracabilite, photos et pieces jointes.</p>
        </div>
        <Link className="button secondary" href="/parc">
          Retour au parc
        </Link>
      </div>
      <AssetUnitDetail assetUnitId={id} />
    </main>
  );
}
