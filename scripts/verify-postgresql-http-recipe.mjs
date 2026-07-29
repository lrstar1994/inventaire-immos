import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const campaign = process.argv.find((value) => value.startsWith("PG-RECIPE-PHASE8-"));
if (!campaign) throw new Error("Identifiant de campagne PG-RECIPE-PHASE8-* obligatoire.");
const campaignManifest = JSON.parse(await readFile(
  path.resolve("outputs", "migration", "phase8-http-recipe", campaign, "manifest.json"),
  "utf8"
));
const createdIds = [...new Set(campaignManifest.created.map((item) => item.id))];

const env = await loadSupabaseEnv();
const recipeUrl = new URL(env.SUPABASE_DIRECT_URL);
recipeUrl.searchParams.set("schema", "immos_recipe_phase8");
const prisma = new PrismaClient({ datasourceUrl: recipeUrl.toString(), errorFormat: "minimal" });

const tables = [
  "users", "suppliers", "locations", "asset_categories", "asset_items", "asset_entries",
  "asset_units", "asset_files", "asset_movements", "asset_movement_lines", "asset_documents",
  "asset_document_entries", "asset_document_lines", "sensitive_action_approvals", "audit_logs"
];

try {
  const counts = {};
  for (const table of tables) {
    const [row] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM "immos_recipe_phase8"."${table}"`
    );
    counts[table] = row.count;
  }
  const [referenceTotal] = await prisma.$queryRawUnsafe(
    `SELECT (${tables.map((table) => `(SELECT COUNT(*) FROM "immos"."${table}")`).join(" + ")})::int AS count`
  );
  async function inspectCampaign(schema) {
    const [campaignRows] = await prisma.$queryRawUnsafe(
      `SELECT
        (SELECT COUNT(*) FROM "${schema}"."suppliers" WHERE name LIKE $1)::int AS suppliers,
        (SELECT COUNT(*) FROM "${schema}"."locations" WHERE name LIKE $1)::int AS locations,
        (SELECT COUNT(*) FROM "${schema}"."asset_categories" WHERE name LIKE $1)::int AS asset_categories,
        (SELECT COUNT(*) FROM "${schema}"."asset_items" WHERE name LIKE $1)::int AS asset_items,
        (SELECT COUNT(*) FROM "${schema}"."asset_entries" WHERE notes LIKE $1)::int AS asset_entries,
        (SELECT COUNT(*) FROM "${schema}"."asset_units" WHERE notes LIKE $1)::int AS asset_units,
        (SELECT COUNT(*) FROM "${schema}"."audit_logs" WHERE summary LIKE $2 OR metadata LIKE $2)::int AS audit_logs`,
      `${campaign}%`,
      `%${campaign}%`
    );
    const audits = await prisma.$queryRawUnsafe(
      `SELECT id, action, entity_table, entity_id FROM "${schema}"."audit_logs"
       WHERE summary LIKE $1 OR metadata LIKE $1 ORDER BY created_at, id`,
      `%${campaign}%`
    );
    return { campaignRows, audits };
  }
  const recipeCampaign = await inspectCampaign("immos_recipe_phase8");
  const referenceCampaign = await inspectCampaign("immos");
  const auditsByCreatedEntity = await prisma.$queryRawUnsafe(
    `SELECT id, action, entity_table, entity_id
     FROM "immos_recipe_phase8"."audit_logs"
     WHERE entity_id = ANY($1::text[]) ORDER BY created_at, id`,
    createdIds
  );
  const [invalidForeignKeys] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM (
       SELECT 1 FROM "immos_recipe_phase8"."asset_items" c LEFT JOIN "immos_recipe_phase8"."asset_categories" p ON p.id=c.category_id WHERE p.id IS NULL
       UNION ALL SELECT 1 FROM "immos_recipe_phase8"."asset_entries" c LEFT JOIN "immos_recipe_phase8"."asset_items" p ON p.id=c.asset_item_id WHERE p.id IS NULL
       UNION ALL SELECT 1 FROM "immos_recipe_phase8"."asset_units" c LEFT JOIN "immos_recipe_phase8"."asset_entries" p ON p.id=c.entry_id WHERE p.id IS NULL
       UNION ALL SELECT 1 FROM "immos_recipe_phase8"."asset_movement_lines" c LEFT JOIN "immos_recipe_phase8"."asset_movements" p ON p.id=c.movement_id WHERE p.id IS NULL
       UNION ALL SELECT 1 FROM "immos_recipe_phase8"."asset_document_entries" c LEFT JOIN "immos_recipe_phase8"."asset_documents" p ON p.id=c.document_id WHERE p.id IS NULL
       UNION ALL SELECT 1 FROM "immos_recipe_phase8"."asset_document_lines" c LEFT JOIN "immos_recipe_phase8"."asset_documents" p ON p.id=c.document_id WHERE p.id IS NULL
     ) invalid`
  );
  console.log(JSON.stringify({
    campaign,
    schema: "immos_recipe_phase8",
    counts,
    totalRows: Object.values(counts).reduce((sum, value) => sum + value, 0),
    referenceImmosTotal: referenceTotal.count,
    recipeCampaign,
    referenceCampaign,
    auditsByCreatedEntity,
    foreignKeyViolations: invalidForeignKeys.count,
    assetFilesEmpty: counts.asset_files === 0
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
