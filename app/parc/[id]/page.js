import Link from "next/link";
import AccessDenied from "@/app/components/access-denied";
import { authorizePrivatePage } from "@/lib/authorization-page";
import AssetUnitDetail from "./asset-unit-detail";

export const metadata = {
  title: "Fiche bien | Inventaire Immos"
};

export const dynamic = "force-dynamic";

export default async function AssetUnitPage({ params }) {
  const { id } = await params;
  const access = await authorizePrivatePage({ returnTo: `/parc/${id}` });
  if (access.status !== "authorized") {
    return <AccessDenied status={access.status} />;
  }

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
