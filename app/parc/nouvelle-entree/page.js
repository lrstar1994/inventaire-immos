import AccessDenied from "@/app/components/access-denied";
import { APP_PERMISSIONS, hasPermission } from "@/lib/authorization";
import { authorizePrivatePage } from "@/lib/authorization-page";
import { prisma } from "@/lib/prisma";
import EntryArticlePicker from "./entry-article-picker";

export const metadata = { title: "Choisir l’article | Inventaire Immos" };
export const dynamic = "force-dynamic";

export default async function NewEntryPage() {
  const access = await authorizePrivatePage({ returnTo: "/parc/nouvelle-entree" });
  if (access.status !== "authorized") return <AccessDenied status={access.status} />;
  if (!hasPermission(access.user, APP_PERMISSIONS.ASSETS_WRITE)) return <AccessDenied status="forbidden" />;
  const [assetItems, locations] = await Promise.all([
    prisma.assetItem.findMany({
      where: { status: "ACTIVE", deletedAt: null, category: { hierarchyLevel: "FAMILY", status: "ACTIVE", deletedAt: null } },
      select: { id: true, code: true, name: true, category: { select: { name: true, trackingMode: true } } },
      orderBy: { name: "asc" }
    }),
    prisma.location.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } })
  ]);
  return <main className="shell park-shell"><EntryArticlePicker assetItems={assetItems} locations={locations} /></main>;
}
