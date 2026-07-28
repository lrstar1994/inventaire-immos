import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ReferenceManager from "./reference-manager";

export const metadata = {
  title: "Referentiels | Inventaire Immos"
};

const validTabs = new Set(["suppliers", "locations", "categories", "items"]);

async function loadReferenceData() {
  const [suppliers, locations, categories, items] = await Promise.all([
    prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" }
    }),
    prisma.location.findMany({
      where: { deletedAt: null },
      include: { parent: { select: { id: true, name: true, code: true } } },
      orderBy: { name: "asc" }
    }),
    prisma.assetCategory.findMany({
      where: { deletedAt: null },
      include: { parent: { select: { id: true, name: true, code: true } } },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    }),
    prisma.assetItem.findMany({
      where: { deletedAt: null },
      include: {
        category: { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true, code: true } }
      },
      orderBy: { name: "asc" }
    })
  ]);

  return JSON.parse(JSON.stringify({ suppliers, locations, categories, items }));
}

export default async function ReferentialsPage({ searchParams }) {
  const params = await searchParams;
  const active = validTabs.has(params?.tab) ? params.tab : "suppliers";
  const initialData = await loadReferenceData();

  return (
    <main className="shell">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Lot 2</p>
          <h1>Referentiels</h1>
          <p className="summary">
            Fournisseurs, emplacements, categories hierarchiques et articles modeles.
          </p>
        </div>
        <Link className="button secondary" href="/">
          Accueil
        </Link>
      </div>
      <ReferenceManager initialActive={active} initialData={initialData} />
    </main>
  );
}
