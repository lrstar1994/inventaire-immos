import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const CAMPAIGN = "PG-RECIPE-PHASE8-20260729025413";
const IDS = {
  supplier: "cms5hqxbq0000v59ws1hoghhs",
  locations: ["cms5hrfzy0005v59w8r9cbxep", "cms5hrgui0009v59wlha3q8i0"],
  categories: ["cms5hrkrj000ev59wg4r8sl8r", "cms5hrls8000iv59w4a6uis6p"],
  item: "cms5hrnef000mv59wnej2rner",
  audits: [
    "cms5hqyhu0002v59wqfqi2dn0", "cms5hrdus0004v59wjsv21mqh",
    "cms5hrgdw0007v59wfza1my7w", "cms5hrh87000bv59w5go6ke0p",
    "cms5hrjwl000dv59wlc8dxf1j", "cms5hrl9l000gv59wdpky9ybd",
    "cms5hrm5v000kv59w5k58ut58", "cms5hrns2000ov59w8v9h96q4"
  ]
};

const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
url.searchParams.set("schema", "immos");
if (url.port !== "5432" || url.searchParams.get("sslmode") !== "require") {
  throw new Error("Nettoyage refusé : connexion session 5432 avec sslmode=require obligatoire.");
}
const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });

try {
  const [schema] = await prisma.$queryRaw`SELECT current_schema() AS schema`;
  console.log(JSON.stringify({ provider: "postgresql", client: "normal", expectedSchema: "immos", currentSchema: schema.schema }));
  if (schema.schema !== "immos") throw new Error("Nettoyage refusé : current_schema différent de immos.");

  const [supplier, locations, categories, item, audits] = await Promise.all([
    prisma.supplier.findMany({ where: { id: IDS.supplier }, select: { id: true, name: true } }),
    prisma.location.findMany({ where: { id: { in: IDS.locations } }, select: { id: true, name: true, parentId: true } }),
    prisma.assetCategory.findMany({ where: { id: { in: IDS.categories } }, select: { id: true, name: true, parentId: true } }),
    prisma.assetItem.findMany({ where: { id: IDS.item }, select: { id: true, name: true, categoryId: true, supplierId: true } }),
    prisma.auditLog.findMany({ where: { id: { in: IDS.audits } }, select: { id: true, action: true, entityTable: true, entityId: true } })
  ]);
  const businessRows = [...supplier, ...locations, ...categories, ...item];
  if (businessRows.length !== 6 || audits.length !== 8) {
    throw new Error(`Nettoyage refusé : 6 lignes métier et 8 audits attendus, obtenu ${businessRows.length}+${audits.length}.`);
  }
  if (businessRows.some((row) => !row.name.startsWith(CAMPAIGN))) {
    throw new Error("Nettoyage refusé : une ligne métier n'appartient pas à la campagne.");
  }
  const businessIds = new Set(businessRows.map((row) => row.id));
  if (audits.some((row) => !businessIds.has(row.entityId))) {
    throw new Error("Nettoyage refusé : un audit ne référence pas une ligne de campagne.");
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const result = {};
    result.audit_logs = (await tx.auditLog.deleteMany({ where: { id: { in: IDS.audits } } })).count;
    result.asset_items = (await tx.assetItem.deleteMany({ where: { id: IDS.item } })).count;
    result.asset_categories_child = (await tx.assetCategory.deleteMany({ where: { id: IDS.categories[1] } })).count;
    result.asset_categories_root = (await tx.assetCategory.deleteMany({ where: { id: IDS.categories[0] } })).count;
    result.locations_child = (await tx.location.deleteMany({ where: { id: IDS.locations[1] } })).count;
    result.locations_root = (await tx.location.deleteMany({ where: { id: IDS.locations[0] } })).count;
    result.suppliers = (await tx.supplier.deleteMany({ where: { id: IDS.supplier } })).count;
    if (Object.values(result).reduce((sum, count) => sum + count, 0) !== 14) {
      throw new Error("Rollback : le nombre de suppressions n'est pas égal à 14.");
    }
    return result;
  }, { maxWait: 30000, timeout: 300000 });

  console.log(JSON.stringify({ campaign: CAMPAIGN, result: "COMMIT", deleted }, null, 2));
} finally {
  await prisma.$disconnect();
}
