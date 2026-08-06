import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildProductionRuntimeUrl } from "./preflight-postgresql-production.mjs";

function url(overrides = {}) {
  const target = new URL("postgresql://user:password@example.invalid:6543/postgres");
  target.searchParams.set("sslmode", "require");
  target.searchParams.set("schema", "immos");
  for (const [name, value] of Object.entries(overrides)) {
    if (name === "port") target.port = value;
    else target.searchParams.set(name, value);
  }
  return target.toString();
}

test("le runtime Production qualifié utilise 6543 et les paramètres Prisma attendus", () => {
  const target = buildProductionRuntimeUrl(url());
  assert.equal(target.port, "6543");
  assert.equal(target.searchParams.get("schema"), "immos");
  assert.equal(target.searchParams.get("sslmode"), "require");
  assert.equal(target.searchParams.get("pgbouncer"), "true");
  assert.equal(target.searchParams.get("connection_limit"), "1");
  assert.equal(target.searchParams.get("pool_timeout"), "60");
});

test("le prévol refuse 5432, un schéma différent et SSL relâché", () => {
  assert.throws(() => buildProductionRuntimeUrl(url({ port: "5432" })), /6543/);
  assert.throws(() => buildProductionRuntimeUrl(url({ schema: "immos_recipe_phase8" })), /schema=immos/);
  assert.throws(() => buildProductionRuntimeUrl(url({ sslmode: "prefer" })), /sslmode=require/);
});

test("le runner Production exécute le prévol avant Next.js", async () => {
  const source = await readFile("scripts/run-next-with-database.mjs", "utf8");
  const branch = source.slice(source.indexOf('if (provider === "postgresql")'), source.indexOf('if (provider === "postgresql-recipe")'));
  assert.match(branch, /preflight-postgresql-production\.mjs/);
  assert.match(branch, /spawnSync/);
  assert.match(branch, /Démarrage Production refusé/);
  assert.doesNotMatch(branch, /RECIPE_SKIP_PREFLIGHT/);
});

test("le prévol est strictement en lecture seule et vérifie les états protégés", async () => {
  const source = await readFile("scripts/preflight-postgresql-production.mjs", "utf8");
  assert.match(source, /SET TRANSACTION READ ONLY/);
  assert.match(source, /counts\.total !== 222/);
  assert.match(source, /counts\.asset_units !== 12/);
  assert.match(source, /counts\.asset_files !== 0/);
  assert.match(source, /orphans\.count !== 0/);
  assert.match(source, /StorageProvider/);
  assert.doesNotMatch(source, /\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\s*\(/);
  assert.doesNotMatch(source, /INSERT\s|UPDATE\s|DELETE\s|ALTER\s|DROP\s|TRUNCATE\s/i);
});
