import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const TABLES = Object.freeze(["users", "suppliers", "locations", "asset_categories", "asset_items", "asset_entries", "asset_units", "asset_files", "asset_movements", "asset_movement_lines", "asset_documents", "asset_document_entries", "asset_document_lines", "sensitive_action_approvals", "audit_logs"]);

const env = await loadSupabaseEnv();
const target = new URL(env.SUPABASE_DATABASE_URL);
if (target.port !== "6543" || target.searchParams.get("sslmode") !== "require") throw new Error("Canal Production 6543 attendu.");
target.searchParams.set("schema", "immos");
target.searchParams.set("pgbouncer", "true");
target.searchParams.set("connection_limit", "1");
target.searchParams.set("pool_timeout", "60");

async function counts(tx, schema) {
  const [row] = await tx.$queryRawUnsafe(`SELECT (${TABLES.map((table) => `(SELECT COUNT(*) FROM "${schema}"."${table}")`).join(" + ")})::int AS total, (SELECT COUNT(*)::int FROM "${schema}"."asset_units") AS asset_units, (SELECT COUNT(*)::int FROM "${schema}"."asset_files") AS asset_files`);
  return row;
}

async function recipeOrphans(tx) {
  const [row] = await tx.$queryRawUnsafe(`SELECT ((SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_files" f LEFT JOIN "immos_recipe_phase8"."asset_units" u ON u.id=f.asset_unit_id WHERE u.id IS NULL) + (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_movement_lines" l LEFT JOIN "immos_recipe_phase8"."asset_movements" m ON m.id=l.movement_id LEFT JOIN "immos_recipe_phase8"."asset_units" u ON u.id=l.asset_unit_id WHERE m.id IS NULL OR u.id IS NULL) + (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_document_entries" e LEFT JOIN "immos_recipe_phase8"."asset_documents" d ON d.id=e.document_id LEFT JOIN "immos_recipe_phase8"."asset_entries" a ON a.id=e.asset_entry_id WHERE d.id IS NULL OR a.id IS NULL) + (SELECT COUNT(*) FROM "immos_recipe_phase8"."asset_document_lines" l LEFT JOIN "immos_recipe_phase8"."asset_documents" d ON d.id=l.document_id LEFT JOIN "immos_recipe_phase8"."asset_units" u ON u.id=l.asset_unit_id WHERE d.id IS NULL OR (l.asset_unit_id IS NOT NULL AND u.id IS NULL)))::int AS count`);
  return row.count;
}

const prisma = new PrismaClient({ datasourceUrl: target.toString(), errorFormat: "minimal" });
let databaseState;
try {
  databaseState = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return {
      production: await counts(tx, "immos"),
      recipe: await counts(tx, "immos_recipe_phase8"),
      recipeForeignKeyOrphans: await recipeOrphans(tx)
    };
  });
} finally {
  await prisma.$disconnect();
}

const storageUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const storageBucket = env.SUPABASE_STORAGE_BUCKET;
const storageHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const bucketResponse = await fetch(`${storageUrl}/storage/v1/bucket/${encodeURIComponent(storageBucket)}`, { headers: storageHeaders });
if (!bucketResponse.ok) throw new Error(`Lecture bucket échouée (${bucketResponse.status}).`);
const bucket = await bucketResponse.json();
const listResponse = await fetch(`${storageUrl}/storage/v1/object/list/${encodeURIComponent(storageBucket)}`, { method: "POST", headers: { ...storageHeaders, "content-type": "application/json" }, body: JSON.stringify({ prefix: "", limit: 1, offset: 0, sortBy: { column: "name", order: "asc" } }) });
if (!listResponse.ok) throw new Error(`Lecture objets Storage échouée (${listResponse.status}).`);
const objects = await listResponse.json();

if (databaseState.production.total !== 222 || databaseState.production.asset_units !== 12 || databaseState.production.asset_files !== 0) throw new Error("État Production inattendu.");
if (databaseState.recipe.total !== 253 || databaseState.recipe.asset_units !== 13 || databaseState.recipe.asset_files !== 0 || databaseState.recipeForeignKeyOrphans !== 0) throw new Error("État Recipe inattendu.");
if (bucket.public !== false || objects.length !== 0) throw new Error("État Storage inattendu.");

console.log(JSON.stringify({ result: "PHASE10F_G1_FINAL_STATES_OK", production: databaseState.production, recipe: databaseState.recipe, recipeForeignKeyOrphans: databaseState.recipeForeignKeyOrphans, storage: { bucket: storageBucket, private: bucket.public === false, empty: objects.length === 0 } }, null, 2));
