import { PrismaClient } from "../generated/prisma-postgresql/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const MODES = new Set(["select1", "current-schema", "count"]);
const mode = process.argv[2];

if (!MODES.has(mode)) {
  console.error(JSON.stringify({
    event: "configuration-error",
    message: "Argument obligatoire : select1, current-schema ou count."
  }));
  process.exit(2);
}

const startedAt = new Date();
const processStarted = performance.now();
let prisma;
let maskedHost = "***";
let operationStarted;
let operationFinished;
let disconnectDurationMs = null;

function log(event, details = {}) {
  console.log(JSON.stringify({
    event,
    mode,
    at: new Date().toISOString(),
    ...details
  }));
}

function sanitizeError(error) {
  let message = String(error?.message || error || "Erreur Prisma inconnue.");
  message = message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***");
  if (maskedHost !== "***") {
    const escapedHost = maskedHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    message = message.replace(new RegExp(escapedHost, "gi"), "***");
  }
  return {
    name: error?.name || "Error",
    code: error?.code || null,
    message
  };
}

try {
  const env = await loadSupabaseEnv();
  const target = new URL(env.SUPABASE_DATABASE_URL);
  maskedHost = target.hostname;

  if (target.port !== "6543") {
    throw new Error("Le diagnostic exige le port 6543.");
  }
  if (target.searchParams.get("sslmode") !== "require") {
    throw new Error("Le diagnostic exige sslmode=require.");
  }
  if (target.searchParams.get("schema") !== "immos") {
    throw new Error("Le diagnostic exige schema=immos.");
  }

  target.searchParams.set("pgbouncer", "true");
  target.searchParams.set("connection_limit", "1");
  target.searchParams.set("pool_timeout", "60");

  const clientCreatedAt = performance.now();
  prisma = new PrismaClient({
    datasourceUrl: target.toString(),
    errorFormat: "minimal"
  });

  log("start", {
    startedAt: startedAt.toISOString(),
    provider: "postgresql",
    client: "generated/prisma-postgresql",
    schema: "immos",
    port: 6543,
    pooler: "transaction",
    ssl: "require",
    clientCreationMs: Math.round(performance.now() - clientCreatedAt)
  });

  operationStarted = performance.now();
  let result;

  if (mode === "select1") {
    const rows = await prisma.$queryRaw`SELECT 1::int AS value`;
    result = { value: rows[0]?.value };
    if (result.value !== 1) throw new Error("SELECT 1 a retourne une valeur inattendue.");
  } else if (mode === "current-schema") {
    const rows = await prisma.$queryRaw`SELECT current_schema() AS schema`;
    result = { schema: rows[0]?.schema };
    if (result.schema !== "immos") {
      throw new Error(`Schema inattendu : ${result.schema || "null"}.`);
    }
  } else {
    const count = await prisma.assetFile.count();
    result = { model: "assetFile", count, expected: 0 };
    if (count !== 0) throw new Error(`asset_files contient ${count} ligne(s), 0 attendu.`);
  }

  operationFinished = performance.now();
  log("success", {
    durationMs: Math.round(operationFinished - operationStarted),
    result
  });
} catch (error) {
  operationFinished = performance.now();
  log("failure", {
    durationMs: operationStarted ? Math.round(operationFinished - operationStarted) : null,
    error: sanitizeError(error)
  });
  process.exitCode = 1;
} finally {
  if (prisma) {
    const disconnectStarted = performance.now();
    try {
      await prisma.$disconnect();
      disconnectDurationMs = Math.round(performance.now() - disconnectStarted);
      log("disconnect", { success: true, durationMs: disconnectDurationMs });
    } catch (error) {
      disconnectDurationMs = Math.round(performance.now() - disconnectStarted);
      log("disconnect", {
        success: false,
        durationMs: disconnectDurationMs,
        error: sanitizeError(error)
      });
      process.exitCode = 1;
    }
  }

  log("finish", {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    totalDurationMs: Math.round(performance.now() - processStarted),
    exitCode: process.exitCode || 0
  });
}
