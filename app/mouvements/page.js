import Link from "next/link";
import AccessDenied from "@/app/components/access-denied";
import { prisma } from "@/lib/prisma";
import { authorizePrivatePage } from "@/lib/authorization-page";
import { APP_PERMISSIONS, hasPermission } from "@/lib/authorization";
import { MOVEMENT_STATUSES, MOVEMENT_TYPES } from "@/lib/movement-constants";
import { movementInclude } from "@/lib/movement-service";
import MovementManager from "./movement-manager";

export const dynamic = "force-dynamic";

async function loadMovementData() {
  const [assetUnits, locations, assetCategories, assetItems, movements] = await Promise.all([
    prisma.assetUnit.findMany({
      where: { deletedAt: null, status: { not: "RETIRED" } },
      include: {
        assetItem: {
          select: {
            id: true,
            name: true,
            code: true,
            categoryId: true,
            category: { select: { id: true, name: true, code: true, parentId: true } }
          }
        },
        location: { select: { id: true, name: true, code: true } }
      },
      orderBy: { assetCode: "asc" }
    }),
    prisma.location.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      orderBy: [{ name: "asc" }]
    }),
    prisma.assetCategory.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    }),
    prisma.assetItem.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      include: { category: { select: { id: true, name: true, code: true, parentId: true } } },
      orderBy: { name: "asc" }
    }),
    prisma.assetMovement.findMany({
      include: movementInclude(),
      orderBy: { movementDate: "desc" }
    })
  ]);

  return JSON.parse(JSON.stringify({
    options: {
      movementTypes: MOVEMENT_TYPES,
      activeMovementTypes: MOVEMENT_TYPES.filter((item) => item.activeInLot5),
      movementStatuses: MOVEMENT_STATUSES,
      assetUnits,
      locations,
      assetCategories,
      assetItems
    },
    movements
  }));
}

export default async function MovementsPage() {
  const access = await authorizePrivatePage({ returnTo: "/mouvements" });
  if (access.status !== "authorized") {
    return <AccessDenied status={access.status} />;
  }
  const initialData = await loadMovementData();

  return (
    <main className="shell">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Mouvements</p>
          <h1>Mouvements et affectations</h1>
          <p className="summary">
            Preparez un brouillon, choisissez volontairement les biens, puis validez pour mettre a jour leur emplacement reel.
          </p>
        </div>
        <Link className="button secondary" href="/">
          Retour accueil
        </Link>
      </section>
      <MovementManager
        canCreate={hasPermission(access.user, APP_PERMISSIONS.MOVEMENTS_CREATE)}
        canManage={hasPermission(access.user, APP_PERMISSIONS.MOVEMENTS_MANAGE)}
        initialOptions={initialData.options}
        initialMovements={initialData.movements}
      />
    </main>
  );
}
