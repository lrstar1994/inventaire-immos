import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const env = await loadSupabaseEnv();
const inventoryTables = [
  "users", "suppliers", "locations", "asset_categories", "asset_items",
  "asset_entries", "asset_units", "asset_files", "asset_movements",
  "asset_movement_lines", "asset_documents", "asset_document_entries",
  "asset_document_lines", "sensitive_action_approvals", "audit_logs"
];

async function inspect(url) {
  const prisma = new PrismaClient({ datasourceUrl: url, errorFormat: "minimal" });
  try {
    const [identity] = await prisma.$queryRawUnsafe(
      `SELECT current_database() AS database_name,
              current_user AS database_user,
              current_schema() AS current_schema,
              EXISTS (
                SELECT 1 FROM pg_stat_ssl
                WHERE pid = pg_backend_pid() AND ssl = true
              ) AS ssl_active`
    );
    const [schemas] = await prisma.$queryRawUnsafe(
      `SELECT
         EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'immos') AS immos_exists,
         (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = 'immos') AS immos_tables,
         (SELECT COUNT(*)::int FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = ANY($1::text[])) AS inventory_tables_in_public`,
      inventoryTables
    );
    return { connected: true, identity, schemas };
  } catch (error) {
    return {
      connected: false,
      errorCode: error.code || "CONNECTION_FAILED"
    };
  } finally {
    await prisma.$disconnect();
  }
}

const direct = await inspect(env.SUPABASE_DIRECT_URL);
const runtime = await inspect(env.SUPABASE_DATABASE_URL);
const result = {
  checkedAt: new Date().toISOString(),
  directConnection: direct.connected,
  runtimeConnection: runtime.connected,
  directErrorCode: direct.connected ? null : direct.errorCode,
  runtimeErrorCode: runtime.connected ? null : runtime.errorCode,
  sameDatabase: direct.connected && runtime.connected
    ? direct.identity.database_name === runtime.identity.database_name
    : null,
  sameDatabaseUser: direct.connected && runtime.connected
    ? direct.identity.database_user === runtime.identity.database_user
    : null,
  directSslActive: direct.connected ? direct.identity.ssl_active : null,
  runtimeSslActive: runtime.connected ? runtime.identity.ssl_active : null,
  directSslRequiredByConnection: new URL(env.SUPABASE_DIRECT_URL).searchParams.get("sslmode") === "require",
  runtimeSslRequiredByConnection: new URL(env.SUPABASE_DATABASE_URL).searchParams.get("sslmode") === "require",
  directCurrentSchema: direct.connected ? direct.identity.current_schema : null,
  runtimeCurrentSchema: runtime.connected ? runtime.identity.current_schema : null,
  immosSchemaExists: (direct.connected ? direct : runtime).schemas?.immos_exists ?? null,
  immosTableCount: (direct.connected ? direct : runtime).schemas?.immos_tables ?? null,
  inventoryTablesInPublic: (direct.connected ? direct : runtime).schemas?.inventory_tables_in_public ?? null
};

console.log(JSON.stringify(result, null, 2));
if (!result.directConnection || !result.runtimeConnection) process.exit(2);
if (!result.sameDatabase) throw new Error("Les connexions directe et runtime ne ciblent pas la même base.");
if (!result.directSslRequiredByConnection || !result.runtimeSslRequiredByConnection) {
  throw new Error("SSL n'est pas imposé sur les deux connexions.");
}
if (result.inventoryTablesInPublic !== 0) throw new Error("Des tables Inventaire Immos existent déjà dans public.");
if (result.immosTableCount !== 0) throw new Error("Le schéma immos n'est pas vide.");
