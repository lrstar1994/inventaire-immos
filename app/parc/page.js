import Link from "next/link";
import AccessDenied from "@/app/components/access-denied";
import { prisma } from "@/lib/prisma";
import { authorizePrivatePage } from "@/lib/authorization-page";
import { APP_PERMISSIONS, hasPermission } from "@/lib/authorization";
import { ASSET_CONDITIONS, ASSET_STATUSES, ENTRY_STATUSES, ENTRY_TYPES, INFORMATION_STATUSES } from "@/lib/asset-constants";
import { assetFileOptions } from "@/lib/asset-file-service";
import { listAssetUnitsPage } from "@/lib/asset-unit-list";
import AssetPark from "./asset-park";

export const metadata = {
  title: "Parc physique | Inventaire Immos"
};

export const dynamic = "force-dynamic";

async function loadParkData() {
  const [assetCategories, locations, unitPage, entries] = await Promise.all([
    prisma.assetCategory.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true, code: true, parentId: true, hierarchyLevel: true, trackingMode: true, controlLevel: true, displayOrder: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    }),
    prisma.location.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true, code: true, parentId: true, parent: { select: { id: true, name: true, code: true } } },
      orderBy: { name: "asc" }
    }),
    listAssetUnitsPage(),
    prisma.assetEntry.findMany({
      select: {
        id: true,
        entryNumber: true,
        quantity: true,
        entryStatus: true,
        assetItem: { select: { id: true, name: true, code: true } },
      },
      orderBy: { entryDate: "desc" },
      take: 8
    })
  ]);

  return JSON.parse(JSON.stringify({
    options: {
      assetItems: [],
      assetCategories,
      locations,
      suppliers: [],
      conditions: ASSET_CONDITIONS,
      statuses: ASSET_STATUSES,
      informationStatuses: INFORMATION_STATUSES,
      entryTypes: ENTRY_TYPES,
      entryStatuses: ENTRY_STATUSES,
      assetFileOptions: assetFileOptions()
    },
    units: unitPage.units,
    unitPagination: unitPage.pagination,
    entries,
    quantitativeStocks: null,
    equipmentSets: null
  }));
}

export default async function ParkPage() {
  const access = await authorizePrivatePage({ returnTo: "/parc" });
  if (access.status !== "authorized") {
    return <AccessDenied status={access.status} />;
  }
  const initialData = await loadParkData();

  return (
    <main className="shell park-shell">
      <div className="section-heading park-heading">
        <div>
          <p className="eyebrow">Inventaire des immobilisations</p>
          <h1>Parc physique</h1>
          <p className="summary">
            Consultez, filtrez et creez les biens physiques par article, modele et emplacement.
          </p>
        </div>
        <div className="hero-actions">
          {hasPermission(access.user, APP_PERMISSIONS.ASSETS_WRITE) ? <Link className="button" href="/parc/nouvelle-entree">Nouvelle entrée</Link> : null}
          <Link className="button secondary" href="/parc/entrees-en-cours">Entrées en cours</Link>
          <Link className="button secondary" href="/referentiels">
            Referentiels
          </Link>
          <Link className="button secondary" href="/">
            Accueil
          </Link>
        </div>
      </div>
      <AssetPark canWrite={hasPermission(access.user, APP_PERMISSIONS.ASSETS_WRITE)} initialOptions={initialData.options} initialUnits={initialData.units} initialUnitPagination={initialData.unitPagination} initialEntries={initialData.entries} initialQuantitativeStocks={initialData.quantitativeStocks} initialEquipmentSets={initialData.equipmentSets} />
    </main>
  );
}
