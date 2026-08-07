import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

test("le package racine ne force plus les sorties Next.js en ESM", async () => {
  const packageJson = await readJson("package.json");
  assert.equal(Object.hasOwn(packageJson, "type"), false);
  assert.equal(packageJson.prisma.seed, "node prisma/seed.mjs");
  assert.equal(Object.hasOwn(packageJson.scripts, "postbuild:postgresql"), false);
  assert.equal(Object.hasOwn(packageJson.scripts, "postbuild:sqlite"), false);
});

test("la frontière ESM est limitée aux modules source de lib", async () => {
  const libPackage = await readJson("lib/package.json");
  assert.equal(libPackage.type, "module");
  assert.equal(libPackage.private, true);

  const imported = await import(new URL("lib/asset-codes.js", root));
  assert.equal(typeof imported.generateAssetCodes, "function");
});

test("le seed ESM est syntaxiquement valide et l'ancien seed a disparu", async () => {
  const seedPath = new URL("prisma/seed.mjs", root);
  const check = spawnSync(process.execPath, ["--check", fileURLToPath(seedPath)], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(check.status, 0, check.stderr);
  await assert.rejects(access(new URL("prisma/seed.js", root)));
});

test("le contournement du package .next/server a été supprimé", async () => {
  await assert.rejects(access(new URL("scripts/mark-next-server-commonjs.mjs", root)));
  const runner = await readFile(new URL("scripts/run-next-with-database.mjs", root), "utf8");
  assert.doesNotMatch(runner, /mark-next-server-commonjs|\.next[\\/]server[\\/]package\.json/);
});

test("le build PostgreSQL conserve la génération des trois clients Prisma", async () => {
  const runner = await readFile(new URL("scripts/run-next-with-database.mjs", root), "utf8");
  assert.match(runner, /"prisma", "schema\.prisma"/);
  assert.match(runner, /"prisma", "postgresql", "schema\.prisma"/);
  assert.match(runner, /"prisma", "postgresql-recipe", "schema\.prisma"/);
});
