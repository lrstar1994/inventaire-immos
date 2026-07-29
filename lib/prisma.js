import { createPrismaClient } from "@/lib/prisma-client-factory";
import { assertExpectedSchema } from "@/lib/schema-guard";

const globalForPrisma = globalThis;
const provider = process.env.APP_DATABASE_PROVIDER || "sqlite";
if (!["sqlite", "postgresql"].includes(provider)) {
  throw new Error(`APP_DATABASE_PROVIDER invalide : "${provider}".`);
}

const clientSelection = provider === "sqlite"
  ? "sqlite"
  : process.env.APP_PRISMA_CLIENT || "normal";
if (provider === "postgresql" && !["normal", "recipe"].includes(clientSelection)) {
  throw new Error("APP_PRISMA_CLIENT invalide. Valeurs autorisées : normal, recipe.");
}

const log = process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];
const globalKey = `__inventairePrisma_${provider}_${clientSelection}`;

function createClient() {
  let postgresqlUrl;
  if (provider === "postgresql") {
    if (!process.env.SUPABASE_DATABASE_URL) {
      throw new Error("Le backend postgresql exige SUPABASE_DATABASE_URL.");
    }
    const target = new URL(process.env.SUPABASE_DATABASE_URL);
    if (clientSelection === "recipe") {
      if (target.port !== "5432" || target.searchParams.get("sslmode") !== "require") {
        throw new Error("Le client recipe exige le port 5432 avec sslmode=require.");
      }
      target.searchParams.delete("pgbouncer");
    } else {
      target.searchParams.set("pgbouncer", "true");
      target.searchParams.set("connection_limit", "1");
      target.searchParams.set("pool_timeout", "60");
    }
    postgresqlUrl = target.toString();
  }
  return createPrismaClient({
    provider,
    clientSelection,
    sqliteUrl: process.env.DATABASE_URL,
    postgresqlUrl,
    log
  });
}

export const databaseProvider = provider;
export const databaseClientSelection = clientSelection;
export const expectedPostgreSQLSchema = clientSelection === "recipe" ? "immos_recipe_phase8" : "immos";
export const prisma = globalForPrisma[globalKey] || createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma[globalKey] = prisma;

export async function assertActiveDatabaseSchema(client) {
  if (databaseProvider !== "postgresql") return null;
  return assertExpectedSchema(client, expectedPostgreSQLSchema, databaseClientSelection);
}
