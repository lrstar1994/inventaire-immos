import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./phase10f-e1-align-production.mjs", import.meta.url),
  "utf8"
);

test("la cible et la confirmation Production sont explicites", () => {
  assert.match(source, /const PRODUCTION_SCHEMA = "immos"/);
  assert.match(source, /PHASE10F_E1_CONFIRM_PRODUCTION/);
  assert.match(source, /ALIGN_IMMOS_STORAGE_COLUMNS/);
  assert.match(source, /current_schema\(\)/);
});

test("le mode par défaut est INSPECT et la transaction devient read-only", () => {
  assert.match(source, /PHASE10F_E1_MODE \|\| "INSPECT"/);
  assert.match(source, /SET TRANSACTION READ ONLY/);
  assert.match(source, /"INSPECT", "EXECUTE"/);
});

test("les seules mutations déclarées sont l'enum et quatre ADD COLUMN", () => {
  const ddl = source.match(/`(?:CREATE TYPE|ALTER TABLE)[^`]+`/g) || [];
  assert.equal(ddl.length, 5);
  assert.equal(ddl.filter((statement) => statement.includes("CREATE TYPE")).length, 1);
  assert.equal(ddl.filter((statement) => statement.includes("ADD COLUMN")).length, 4);
  assert.doesNotMatch(ddl.join("\n"), /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/i);
  assert.doesNotMatch(ddl.join("\n"), /CREATE INDEX/i);
});

test("la définition de l'enum provient de Recipe et est comparée à Prisma", () => {
  assert.match(source, /readEnum\(tx, RECIPE_SCHEMA\)/);
  assert.match(source, /enumValuesFromPrisma\(\)/);
  assert.match(source, /assertEqual\(recipeEnum, prismaEnum/);
  assert.match(source, /before\.recipeEnum[\s\S]+CREATE TYPE/);
});

test("les contrôles avant commit couvrent données, structure et Recipe", () => {
  assert.match(source, /assertStorageColumns\(after\.productionColumns/);
  assert.match(source, /checksums tables Production/);
  assert.match(source, /checksums tables Recipe/);
  assert.match(source, /contraintes historiques avant\/après/);
  assert.match(source, /index historiques avant\/après/);
  assert.match(source, /FK orphelines avant\/après/);
});
