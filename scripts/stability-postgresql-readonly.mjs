import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const exportRoot = path.resolve("outputs", "migration", "sqlite-export", "run-1");
const manifest = JSON.parse(await readFile(path.join(exportRoot, "manifest.json"), "utf8"));
const env = await loadSupabaseEnv();
const url = new URL(env.SUPABASE_DIRECT_URL);
url.searchParams.set("schema", "immos_recipe_phase8");
if (url.port !== "5432" || url.searchParams.get("sslmode") !== "require") {
  throw new Error("Le test de stabilité exige le pooler Session 5432 avec SSL.");
}
const prisma = new PrismaClient({ datasourceUrl: url.toString(), errorFormat: "minimal" });
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const results = [];

async function series(number) {
  const started = performance.now();
  let operation = "SELECT 1";
  try {
    const [one] = await prisma.$queryRaw`SELECT 1::int AS value`;
    operation = "current_schema";
    const [schema] = await prisma.$queryRaw`SELECT current_schema() AS schema`;
    operation = "totals";
    const [totals] = await prisma.$queryRawUnsafe(
      `SELECT
        (${manifest.tables.map((table) => `(SELECT COUNT(*) FROM "immos".${quote(table.table)})`).join(" + ")})::int AS immos_total,
        (${manifest.tables.map((table) => `(SELECT COUNT(*) FROM "immos_recipe_phase8".${quote(table.table)})`).join(" + ")})::int AS recipe_total`
    );
    operation = "immos fingerprints";
    const hashes = {};
    for (const table of manifest.tables) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT ${table.columns.map(quote).join(",")} FROM "immos".${quote(table.table)} ORDER BY ${quote(table.primaryKey)}`
      );
      hashes[table.table] = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
    }
    return {
      series: number,
      selectOne: one.value,
      currentSchema: schema.schema,
      immosTotal: totals.immos_total,
      recipeTotal: totals.recipe_total,
      aggregateFingerprint: createHash("sha256").update(JSON.stringify(hashes)).digest("hex"),
      durationMs: Math.round(performance.now() - started)
    };
  } catch (error) {
    console.error(JSON.stringify({
      result: "FAILED",
      series: number,
      operation,
      durationMs: Math.round(performance.now() - started),
      errorCode: error.code || "P1001_OR_INITIALIZATION",
      message: String(error.message || error).replace(/postgresql:\/\/[^\s]+/g, "[CONNECTION_REDACTED]")
    }, null, 2));
    throw error;
  }
}

try {
  for (let number = 1; number <= 3; number += 1) {
    const result = await series(number);
    results.push(result);
    console.log(JSON.stringify(result));
    if (result.selectOne !== 1 || result.currentSchema !== "immos_recipe_phase8" ||
        result.immosTotal !== 222 || result.recipeTotal !== 247) {
      throw new Error(`Série ${number} non conforme.`);
    }
    if (number < 3) await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  const fingerprintsEqual = results.every((item) =>
    item.aggregateFingerprint === results[0].aggregateFingerprint
  );
  console.log(JSON.stringify({
    result: "STABLE_3_OF_3",
    client: "generated/prisma-recipe",
    port: 5432,
    results,
    fingerprintsEqual
  }, null, 2));
  if (!fingerprintsEqual) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
