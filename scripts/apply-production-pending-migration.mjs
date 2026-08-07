import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";
import { buildProductionRuntimeUrl } from "./preflight-postgresql-production.mjs";

const CONFIRMATION = "APPLY_PENDING_TO_IMMOS_PRODUCTION";
const TABLES = Object.freeze(["users", "suppliers", "locations", "asset_categories", "asset_items", "asset_entries", "asset_units", "asset_files", "asset_movements", "asset_movement_lines", "asset_documents", "asset_document_entries", "asset_document_lines", "sensitive_action_approvals", "audit_logs"]);

function isExecute() {
  const argument = process.argv.find((value) => value.startsWith("--confirm="));
  return argument === `--confirm=${CONFIRMATION}`;
}

async function inspect(tx) {
  const [identity] = await tx.$queryRawUnsafe("SELECT current_schema() AS schema");
  if (identity?.schema !== "immos") throw new Error("Cible refusée : current_schema() doit valoir immos.");
  const [counts] = await tx.$queryRawUnsafe(`SELECT (${TABLES.map((table) => `(SELECT COUNT(*) FROM "immos"."${table}")`).join(" + ")})::int AS total, (SELECT COUNT(*)::int FROM "immos"."asset_units") AS asset_units, (SELECT COUNT(*)::int FROM "immos"."asset_files") AS asset_files`);
  if (counts.total !== 222 || counts.asset_units !== 12 || counts.asset_files !== 0) throw new Error("Totaux Production protégés inattendus.");
  const [orphans] = await tx.$queryRawUnsafe(`SELECT ((SELECT COUNT(*) FROM "immos"."asset_files" f LEFT JOIN "immos"."asset_units" u ON u.id=f.asset_unit_id WHERE u.id IS NULL) + (SELECT COUNT(*) FROM "immos"."asset_movement_lines" l LEFT JOIN "immos"."asset_movements" m ON m.id=l.movement_id LEFT JOIN "immos"."asset_units" u ON u.id=l.asset_unit_id WHERE m.id IS NULL OR u.id IS NULL) + (SELECT COUNT(*) FROM "immos"."asset_document_entries" e LEFT JOIN "immos"."asset_documents" d ON d.id=e.document_id LEFT JOIN "immos"."asset_entries" a ON a.id=e.asset_entry_id WHERE d.id IS NULL OR a.id IS NULL) + (SELECT COUNT(*) FROM "immos"."asset_document_lines" l LEFT JOIN "immos"."asset_documents" d ON d.id=l.document_id LEFT JOIN "immos"."asset_units" u ON u.id=l.asset_unit_id WHERE d.id IS NULL OR (l.asset_unit_id IS NOT NULL AND u.id IS NULL)))::int AS count`);
  if (orphans.count !== 0) throw new Error("FK orphelines Production détectées.");
  const [duplicates] = await tx.$queryRawUnsafe(`SELECT (SELECT COUNT(*)::int FROM (SELECT email FROM "immos"."users" GROUP BY email HAVING COUNT(*) > 1) d) AS emails, (SELECT COUNT(*)::int FROM (SELECT external_auth_id FROM "immos"."users" WHERE external_auth_id IS NOT NULL GROUP BY external_auth_id HAVING COUNT(*) > 1) d) AS external_ids`);
  if (duplicates.emails !== 0 || duplicates.external_ids !== 0) throw new Error("Doublons utilisateurs incompatibles avec la migration.");
  const [users] = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE status::text='PENDING')::int AS pending, md5(COALESCE(string_agg(concat_ws('|', id, email, name, role::text, status::text, auth_provider, COALESCE(external_auth_id,''), COALESCE(deleted_at::text,'')), E'\n' ORDER BY id), '')) AS checksum FROM "immos"."users"`);
  const enumRows = await tx.$queryRawUnsafe(`SELECT e.enumlabel AS value FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='immos' AND t.typname='UserStatus' ORDER BY e.enumsortorder`);
  const indexes = await tx.$queryRawUnsafe(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='immos' AND tablename='users' AND indexname IN ('users_email_key','users_external_auth_id_idx','users_external_auth_id_key') ORDER BY indexname`);
  return {
    schema: identity.schema,
    total: counts.total,
    assetUnits: counts.asset_units,
    assetFiles: counts.asset_files,
    foreignKeyOrphans: orphans.count,
    duplicateEmails: duplicates.emails,
    duplicateExternalAuthIds: duplicates.external_ids,
    userCount: users.count,
    pendingUsers: users.pending,
    userChecksum: users.checksum,
    userStatusValues: enumRows.map((row) => row.value),
    indexes
  };
}

async function main() {
  const env = await loadSupabaseEnv();
  const target = buildProductionRuntimeUrl(env.SUPABASE_DATABASE_URL);
  const prisma = new PrismaClient({ datasourceUrl: target.toString(), errorFormat: "minimal" });
  try {
    if (!isExecute()) {
      const state = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        return inspect(tx);
      });
      console.log(JSON.stringify({ result: "PRODUCTION_PENDING_MIGRATION_INSPECT_OK", mode: "INSPECT", ...state, userChecksum: "verified" }, null, 2));
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const before = await inspect(tx);
      const validBefore = JSON.stringify(before.userStatusValues) === JSON.stringify(["ACTIVE", "DISABLED"])
        || JSON.stringify(before.userStatusValues) === JSON.stringify(["PENDING", "ACTIVE", "DISABLED"]);
      if (!validBefore) throw new Error("Enum UserStatus Production dans un état inattendu.");
      if (before.pendingUsers !== 0) throw new Error("Une demande PENDING inattendue existe avant migration.");

      await tx.$executeRawUnsafe(`ALTER TYPE "immos"."UserStatus" ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'ACTIVE'`);
      await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "users_external_auth_id_key" ON "immos"."users"("external_auth_id")`);

      const after = await inspect(tx);
      if (JSON.stringify(after.userStatusValues) !== JSON.stringify(["PENDING", "ACTIVE", "DISABLED"])) throw new Error("Enum UserStatus non conforme avant COMMIT.");
      const uniqueIndex = after.indexes.find((index) => index.indexname === "users_external_auth_id_key");
      if (!uniqueIndex?.indexdef?.includes("CREATE UNIQUE INDEX")) throw new Error("Unicité externalAuthId non conforme avant COMMIT.");
      if (before.total !== after.total || before.assetUnits !== after.assetUnits || before.assetFiles !== after.assetFiles || before.userCount !== after.userCount || before.userChecksum !== after.userChecksum) throw new Error("Une donnée protégée a varié pendant la migration.");
      return { before, after };
    }, { maxWait: 10000, timeout: 60000 });

    console.log(JSON.stringify({
      result: "PRODUCTION_PENDING_MIGRATION_APPLIED",
      mode: "EXECUTE",
      schema: result.after.schema,
      total: result.after.total,
      assetUnits: result.after.assetUnits,
      assetFiles: result.after.assetFiles,
      foreignKeyOrphans: result.after.foreignKeyOrphans,
      pendingUsers: result.after.pendingUsers,
      userStatusValues: result.after.userStatusValues,
      userChecksumUnchanged: result.before.userChecksum === result.after.userChecksum,
      externalAuthUnique: true
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration PENDING Production échouée.");
  process.exitCode = 1;
});
