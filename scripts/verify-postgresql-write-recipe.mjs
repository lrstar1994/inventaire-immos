import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const RECIPE_SCHEMA = "immos_recipe_phase8";
const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
url.searchParams.set("schema", RECIPE_SCHEMA);
const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });

try {
  const [schema] = await prisma.$queryRawUnsafe(
    `SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) AS exists`, RECIPE_SCHEMA
  );
  if (!schema.exists) {
    console.log(JSON.stringify({ schema: RECIPE_SCHEMA, exists: false }, null, 2));
    process.exitCode = 2;
  } else {
    const tables = await prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name`, RECIPE_SCHEMA
    );
    const counts = {};
    for (const { table_name: table } of tables) {
      if (table !== "_prisma_migrations") {
        const [row] = await prisma.$queryRawUnsafe(
          `SELECT COUNT(*)::int AS count FROM "${RECIPE_SCHEMA}"."${table.replaceAll('"', '""')}"`
        );
        counts[table] = row.count;
      }
    }
    const [structure] = await prisma.$queryRawUnsafe(
      `SELECT
        (SELECT COUNT(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
         WHERE n.nspname=$1 AND t.typtype='e') AS enums,
        (SELECT COUNT(*)::int FROM information_schema.table_constraints
         WHERE constraint_schema=$1 AND table_name <> '_prisma_migrations') AS constraints,
        (SELECT COUNT(*)::int FROM pg_indexes
         WHERE schemaname=$1 AND tablename <> '_prisma_migrations') AS indexes`,
      RECIPE_SCHEMA
    );
    console.log(JSON.stringify({
      schema: RECIPE_SCHEMA,
      exists: true,
      tables: tables.map((row) => row.table_name),
      counts,
      totalRows: Object.values(counts).reduce((sum, count) => sum + count, 0),
      enums: structure.enums,
      constraints: structure.constraints,
      indexes: structure.indexes
    }, null, 2));
  }
} finally {
  await prisma.$disconnect();
}
