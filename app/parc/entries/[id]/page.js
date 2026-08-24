import { notFound } from "next/navigation";
import AccessDenied from "@/app/components/access-denied";
import { APP_PERMISSIONS, hasPermission } from "@/lib/authorization";
import { authorizePrivatePage } from "@/lib/authorization-page";
import { ASSET_CONDITIONS, ASSET_STATUSES, ENTRY_TYPES, INFORMATION_STATUSES } from "@/lib/asset-constants";
import { assetFileOptions } from "@/lib/asset-file-service";
import { computeAssetEntryProgress } from "@/lib/asset-service";
import { prisma } from "@/lib/prisma";
import EntryWizard from "./entry-wizard";

export const dynamic = "force-dynamic";

export default async function DraftEntryPage({ params, searchParams }) {
  const { id } = await params;
  const access = await authorizePrivatePage({ returnTo: `/parc/entries/${id}` });
  if (access.status !== "authorized") return <AccessDenied status={access.status} />;
  const [entry, locations, suppliers] = await Promise.all([
    prisma.assetEntry.findUnique({ where: { id }, include: { assetItem: { include: { category: true } }, location: true, supplier: true, assetUnits: { select: { id: true, assetCode: true, status: true } }, quantitativeStockPositions: { include: { location: { select: { id: true, name: true } } } }, documentEntries: { where: { document: { documentType: "ENTRY_SLIP" } }, include: { document: true }, orderBy: { createdAt: "asc" } }, _count: { select: { assetFiles: { where: { deletedAt: null } } } } } }),
    prisma.location.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } })
  ]);
  if (!entry) notFound();
  const query = await searchParams;
  const data = JSON.parse(JSON.stringify({ entry, progress: computeAssetEntryProgress(entry), locations, suppliers, options: { conditions: ASSET_CONDITIONS, statuses: ASSET_STATUSES, entryTypes: ENTRY_TYPES, informationStatuses: INFORMATION_STATUSES, assetFiles: assetFileOptions() }, created: query?.created === "1", requestedStep: query?.step || "details" }));
  return <main className="shell park-shell"><EntryWizard canWrite={hasPermission(access.user, APP_PERMISSIONS.ASSETS_WRITE)} initialData={data} /></main>;
}
