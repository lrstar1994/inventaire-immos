import { PrismaClient as SQLitePrismaClient } from "@/generated/prisma-lot6";
import { PrismaClient as PostgreSQLPrismaClient } from "@/generated/prisma-postgresql";

const globalForPrisma = globalThis;
const provider = process.env.APP_DATABASE_PROVIDER || "sqlite";

if (!["sqlite", "postgresql"].includes(provider)) {
  throw new Error(
    `APP_DATABASE_PROVIDER invalide : "${provider}". Valeurs autorisées : sqlite, postgresql.`
  );
}

const log = process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];
const globalKey = provider === "sqlite" ? "__inventairePrismaSQLite" : "__inventairePrismaPostgreSQL";

function createClient() {
  if (provider === "sqlite") {
    if (!process.env.DATABASE_URL?.startsWith("file:")) {
      throw new Error("Le backend sqlite exige une DATABASE_URL SQLite commençant par file:.");
    }
    return new SQLitePrismaClient({ log });
  }
  if (!process.env.SUPABASE_DATABASE_URL) {
    throw new Error("Le backend postgresql exige SUPABASE_DATABASE_URL.");
  }
  const target = new URL(process.env.SUPABASE_DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(target.protocol) || target.searchParams.get("schema") !== "immos") {
    throw new Error("SUPABASE_DATABASE_URL doit cibler PostgreSQL avec schema=immos.");
  }
  target.searchParams.set("pgbouncer", "true");
  target.searchParams.set("connection_limit", "1");
  target.searchParams.set("pool_timeout", "60");
  return new PostgreSQLPrismaClient({
    datasourceUrl: target.toString(),
    log
  });
}

export const databaseProvider = provider;
export const prisma = globalForPrisma[globalKey] || createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma[globalKey] = prisma;
