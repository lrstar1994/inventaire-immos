import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ASSET_CONDITIONS, ASSET_STATUSES, ENTRY_STATUSES, ENTRY_TYPES, INFORMATION_STATUSES } from "@/lib/asset-constants";
import { assetFileOptions } from "@/lib/asset-file-service";
import { toAssetUnitsAccessDtos } from "@/lib/storage/asset-file-access-dto";
import AssetPark from "./asset-park";

export const metadata = {
  title: "Parc physique | Inventaire Immos"
};

export const dynamic = "force-dynamic";

const unitInclude = {
  assetItem: { select: { id: true, name: true, code: true, categoryId: true } },
  location: { select: { id: true, name: true, code: true } },
  supplier: { select: { id: true, name: true, code: true } },
  entry: { select: { id: true, entryNumber: true, entryType: true, entryStatus: true } },
  documentLines: {
    include: {
      document: { select: { id: true, documentNumber: true, documentType: true, status: true } }
    },
    orderBy: { createdAt: "desc" }
  },
  movementLines: {
    include: {
      movement: { select: { id: true, movementNumber: true, movementType: true, movementStatus: true, movementDate: true } },
      fromLocation: { select: { id: true, name: true, code: true } },
      toLocation: { select: { id: true, name: true, code: true } }
    },
    orderBy: { createdAt: "desc" }
  },
  assetFiles: {
    where: { deletedAt: null },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }]
  }
};

async function loadParkData() {
  const [assetItems, assetCategories, locations, suppliers, units, entries] = await Promise.all([
    prisma.assetItem.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      include: {
        category: { select: { id: true, name: true, code: true, parentId: true } },
        supplier: { select: { id: true, name: true, code: true } }
      },
      orderBy: { name: "asc" }
    }),
    prisma.assetCategory.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    }),
    prisma.location.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      include: { parent: { select: { id: true, name: true, code: true } } },
      orderBy: { name: "asc" }
    }),
    prisma.supplier.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      orderBy: { name: "asc" }
    }),
    prisma.assetUnit.findMany({
      where: { deletedAt: null },
      include: unitInclude,
      orderBy: { assetCode: "asc" }
    }),
    prisma.assetEntry.findMany({
      include: {
        assetItem: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true, code: true } },
        assetUnits: { select: { id: true, assetCode: true, status: true, condition: true } }
      },
      orderBy: { entryDate: "desc" }
    })
  ]);

  const accessibleUnits = await toAssetUnitsAccessDtos(units);

  return JSON.parse(JSON.stringify({
    options: {
      assetItems,
      assetCategories,
      locations,
      suppliers,
      conditions: ASSET_CONDITIONS,
      statuses: ASSET_STATUSES,
      informationStatuses: INFORMATION_STATUSES,
      entryTypes: ENTRY_TYPES,
      entryStatuses: ENTRY_STATUSES,
      assetFileOptions: assetFileOptions()
    },
    units: accessibleUnits,
    entries
  }));
}

export default async function ParkPage() {
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
          <Link className="button secondary" href="/referentiels">
            Referentiels
          </Link>
          <Link className="button secondary" href="/">
            Accueil
          </Link>
        </div>
      </div>
      <AssetPark initialOptions={initialData.options} initialUnits={initialData.units} initialEntries={initialData.entries} />
    </main>
  );
}
