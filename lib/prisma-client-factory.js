import { PrismaClient as SQLitePrismaClient } from "@/generated/prisma-lot6";
import { PrismaClient as PostgreSQLPrismaClient } from "@/generated/prisma-postgresql";
import { PrismaClient as PostgreSQLRecipePrismaClient } from "@/generated/prisma-recipe";

function validatePostgreSQLUrl(rawUrl, expectedSchema, clientName) {
  if (!rawUrl) throw new Error(`${clientName} exige une URL PostgreSQL.`);
  const target = new URL(rawUrl);
  if (!["postgres:", "postgresql:"].includes(target.protocol)) {
    throw new Error(`${clientName} refuse une cible non PostgreSQL.`);
  }
  if (target.searchParams.get("schema") !== expectedSchema) {
    throw new Error(`${clientName} exige schema=${expectedSchema}.`);
  }
  return target;
}

function guardedPostgreSQLClient({ Client, rawUrl, expectedSchema, clientName, log }) {
  const target = validatePostgreSQLUrl(rawUrl, expectedSchema, clientName);
  return new Client({ datasourceUrl: target.toString(), log });
}

export function createPrismaClient({ provider, clientSelection, sqliteUrl, postgresqlUrl, log = ["error"] }) {
  if (provider === "sqlite") {
    if (clientSelection !== "sqlite") throw new Error("Le provider sqlite exige le client sqlite.");
    if (!sqliteUrl?.startsWith("file:")) {
      throw new Error("Le client sqlite exige une DATABASE_URL commençant par file:.");
    }
    return new SQLitePrismaClient({ log });
  }
  if (provider !== "postgresql") throw new Error(`Provider Prisma invalide : ${provider}.`);
  if (clientSelection === "normal") {
    return guardedPostgreSQLClient({
      Client: PostgreSQLPrismaClient,
      rawUrl: postgresqlUrl,
      expectedSchema: "immos",
      clientName: "normal",
      log
    });
  }
  if (clientSelection === "recipe") {
    return guardedPostgreSQLClient({
      Client: PostgreSQLRecipePrismaClient,
      rawUrl: postgresqlUrl,
      expectedSchema: "immos_recipe_phase8",
      clientName: "recipe",
      log
    });
  }
  throw new Error("Le provider postgresql exige APP_PRISMA_CLIENT=normal ou recipe.");
}
