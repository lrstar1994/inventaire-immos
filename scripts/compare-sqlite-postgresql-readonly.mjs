import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient as SQLitePrismaClient } from "../generated/prisma-lot6/index.js";
import { PrismaClient as PostgreSQLPrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const EXPECTED_SQLITE_SHA = "8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec";
const outputRoot = path.resolve(process.cwd(), "outputs/migration/supabase-phase-7");
const sqlitePath = path.resolve(process.cwd(), "prisma/dev.db");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stable = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const checksum = (value) => digest(Buffer.from(JSON.stringify(stable(value)), "utf8"));
const env = await loadSupabaseEnv();
const sqliteBefore = digest(await readFile(sqlitePath));
if (sqliteBefore !== EXPECTED_SQLITE_SHA) throw new Error("Empreinte SQLite inattendue.");
const runtimeUrl = new URL(env.SUPABASE_DATABASE_URL);
runtimeUrl.searchParams.set("pgbouncer", "true");
runtimeUrl.searchParams.set("connection_limit", "1");
runtimeUrl.searchParams.set("pool_timeout", "60");

const sqlite = new SQLitePrismaClient({ datasourceUrl: "file:./dev.db", errorFormat: "minimal" });
const postgresql = new PostgreSQLPrismaClient({ datasourceUrl: runtimeUrl.toString(), errorFormat: "minimal" });

async function snapshot(prisma) {
  const representative = await prisma.assetUnit.findFirst({
    where: { deletedAt: null },
    orderBy: { id: "asc" },
    include: {
      assetItem: { include: { category: true, supplier: true } },
      location: true,
      supplier: true,
      entry: true,
      movementLines: {
        include: { movement: true, fromLocation: true, toLocation: true },
        orderBy: { id: "asc" }
      },
      documentLines: { include: { document: true }, orderBy: { id: "asc" } },
      assetFiles: { where: { deletedAt: null }, orderBy: { id: "asc" } }
    }
  });
  return {
    databaseCounts: {
      users: await prisma.user.count(),
      suppliers: await prisma.supplier.count(),
      locations: await prisma.location.count(),
      assetCategories: await prisma.assetCategory.count(),
      assetItems: await prisma.assetItem.count(),
      assetEntries: await prisma.assetEntry.count(),
      assetUnits: await prisma.assetUnit.count(),
      assetFiles: await prisma.assetFile.count(),
      assetMovements: await prisma.assetMovement.count(),
      assetMovementLines: await prisma.assetMovementLine.count(),
      assetDocuments: await prisma.assetDocument.count(),
      assetDocumentEntries: await prisma.assetDocumentEntry.count(),
      assetDocumentLines: await prisma.assetDocumentLine.count(),
      sensitiveActionApprovals: await prisma.sensitiveActionApproval.count(),
      auditLogs: await prisma.auditLog.count()
    },
    homeCounts: {
      activeUnits: await prisma.assetUnit.count({ where: { deletedAt: null } }),
      draftDocuments: await prisma.assetDocument.count({ where: { status: "DRAFT" } }),
      unitsToRepair: await prisma.assetUnit.count({ where: { deletedAt: null, condition: "TO_REPAIR" } })
    },
    references: {
      suppliers: await prisma.supplier.findMany({ orderBy: { id: "asc" } }),
      locations: await prisma.location.findMany({ orderBy: { id: "asc" } }),
      categories: await prisma.assetCategory.findMany({ orderBy: { id: "asc" } }),
      items: await prisma.assetItem.findMany({ orderBy: { id: "asc" } })
    },
    park: await prisma.assetUnit.findMany({
      orderBy: { id: "asc" },
      include: { assetItem: true, location: true, supplier: true, entry: true }
    }),
    representativeUnit: representative,
    documents: await prisma.assetDocument.findMany({
      orderBy: { id: "asc" },
      include: { entries: { orderBy: { id: "asc" } }, lines: { orderBy: { id: "asc" } } }
    }),
    movements: await prisma.assetMovement.findMany({
      orderBy: { id: "asc" },
      include: { lines: { orderBy: { id: "asc" } }, relatedMovement: true }
    }),
    softDeleted: {
      users: await prisma.user.count({ where: { deletedAt: { not: null } } }),
      suppliers: await prisma.supplier.count({ where: { deletedAt: { not: null } } }),
      locations: await prisma.location.count({ where: { deletedAt: { not: null } } }),
      categories: await prisma.assetCategory.count({ where: { deletedAt: { not: null } } }),
      items: await prisma.assetItem.count({ where: { deletedAt: { not: null } } }),
      units: await prisma.assetUnit.count({ where: { deletedAt: { not: null } } }),
      files: await prisma.assetFile.count({ where: { deletedAt: { not: null } } })
    },
    enumValues: {
      roles: (await prisma.user.findMany({ distinct: ["role"], select: { role: true } })).map((x) => x.role).sort(),
      entryTypes: (await prisma.assetEntry.findMany({ distinct: ["entryType"], select: { entryType: true } })).map((x) => x.entryType).sort(),
      conditions: (await prisma.assetUnit.findMany({ distinct: ["condition"], select: { condition: true } })).map((x) => x.condition).sort(),
      movementTypes: (await prisma.assetMovement.findMany({ distinct: ["movementType"], select: { movementType: true } })).map((x) => x.movementType).sort(),
      documentTypes: (await prisma.assetDocument.findMany({ distinct: ["documentType"], select: { documentType: true } })).map((x) => x.documentType).sort()
    }
  };
}

try {
  const [sqliteData, postgresqlData] = await Promise.all([snapshot(sqlite), snapshot(postgresql)]);
  const sections = {};
  for (const key of Object.keys(sqliteData)) {
    sections[key] = {
      sqliteSha256: checksum(sqliteData[key]),
      postgresqlSha256: checksum(postgresqlData[key])
    };
    sections[key].equal = sections[key].sqliteSha256 === sections[key].postgresqlSha256;
  }
  const sqliteAfter = digest(await readFile(sqlitePath));
  const storageBase = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/storage/v1`;
  const storageHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, "content-type": "application/json" };
  if (env.SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ")) {
    storageHeaders.authorization = `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`;
  }
  const storageResponse = await fetch(
    `${storageBase}/object/list/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}`,
    { method: "POST", headers: storageHeaders, body: JSON.stringify({ prefix: "", limit: 1, offset: 0 }) }
  );
  if (!storageResponse.ok) throw new Error(`Lecture Storage refusée (${storageResponse.status}).`);
  const storageObjects = await storageResponse.json();
  const postgresqlTotalRows = Object.values(postgresqlData.databaseCounts).reduce((sum, count) => sum + count, 0);
  const report = {
    checkedAt: new Date().toISOString(),
    readOnly: true,
    sqliteBefore,
    sqliteAfter,
    representativeAssetId: sqliteData.representativeUnit?.id ?? null,
    postgresqlTotalRows,
    assetFilesRows: postgresqlData.databaseCounts.assetFiles,
    storageEmpty: Array.isArray(storageObjects) && storageObjects.length === 0,
    sections,
    allEqual: Object.values(sections).every((section) => section.equal)
  };
  await mkdir(outputRoot, { recursive: true });
  await writeFile(path.join(outputRoot, "readonly-parity.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (sqliteAfter !== sqliteBefore || !report.allEqual || postgresqlTotalRows !== 222 ||
      report.assetFilesRows !== 0 || !report.storageEmpty) {
    throw new Error("La parité SQLite/PostgreSQL a échoué.");
  }
  console.log(JSON.stringify({
    result: "PARITY_OK",
    sections: Object.keys(sections).length,
    representativeAssetId: report.representativeAssetId,
    sqliteUnchanged: true,
    postgresqlTotalRows,
    assetFilesRows: report.assetFilesRows,
    storageEmpty: report.storageEmpty
  }, null, 2));
} finally {
  await sqlite.$disconnect();
  await postgresql.$disconnect();
}
