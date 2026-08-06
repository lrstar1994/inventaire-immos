import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "../generated/prisma-lot6/index.js";
import { alignSQLiteCopy } from "./align-asset-files-sqlite-copy.mjs";

const workspace = path.resolve(process.cwd());
const source = path.resolve(workspace, "prisma/dev.db");
const backupRoot = path.resolve(workspace, "backups/phase10f-d");
const protectedSha = "8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec";
const alignedSha = "9645a17ea36adfba0c8964fbf536c47a323d22f606896112f4ed62334882d5ed";
const testRoot = path.resolve(workspace, "tmp/phase10f-c/tests");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function copy(name) {
  const backupNames = (await readdir(backupRoot)).filter((item) => item.endsWith(".db"));
  assert.equal(backupNames.length, 1, "une sauvegarde historique 10F-D est requise");
  const historicalSource = path.join(backupRoot, backupNames[0]);
  assert.equal(hash(await readFile(historicalSource)), protectedSha);
  await mkdir(testRoot, { recursive: true });
  const target = path.join(testRoot, `${name}-${randomUUID()}.db`);
  await copyFile(historicalSource, target);
  return target;
}

test("la copie est alignée sans modifier les données, index ou FK historiques", async (t) => {
  const target = await copy("aligned");
  t.after(() => rm(target, { force: true }));
  assert.equal(hash(await readFile(target)), protectedSha);
  const result = await alignSQLiteCopy(target);
  assert.equal(result.result, "COPY_ALIGNED");
  assert.deepEqual(result.columnsAdded, [
    "storage_provider", "storage_bucket", "storage_key", "updated_at"
  ]);
  assert.deepEqual(result.before, result.after);
  assert.equal(hash(await readFile(source)), alignedSha);
});

test("une seconde exécution est idempotente", async (t) => {
  const target = await copy("idempotent");
  t.after(() => rm(target, { force: true }));
  await alignSQLiteCopy(target);
  const second = await alignSQLiteCopy(target);
  assert.equal(second.result, "ALREADY_ALIGNED");
});

test("une structure partiellement alignée est refusée", async (t) => {
  const target = await copy("partial");
  t.after(() => rm(target, { force: true }));
  const db = new DatabaseSync(target);
  db.exec('ALTER TABLE "asset_files" ADD COLUMN "storage_provider" TEXT');
  db.close();
  await assert.rejects(alignSQLiteCopy(target), /UNEXPECTED_ASSET_FILES_STRUCTURE/);
});

test("la vraie SQLite est refusée avant ouverture en écriture", async () => {
  await assert.rejects(alignSQLiteCopy(source), /PROTECTED_SQLITE_REFUSED/);
  await assert.rejects(
    alignSQLiteCopy(source, { allowProtected: true }),
    /VERIFIED_BACKUP_REQUIRED/
  );
  assert.equal(hash(await readFile(source)), alignedSha);
});

test("les URL PostgreSQL et les chemins hors racine sont refusés", async () => {
  await assert.rejects(
    alignSQLiteCopy("postgresql://example.invalid/database"),
    /FILESYSTEM_SQLITE_PATH_REQUIRED/
  );
  await assert.rejects(alignSQLiteCopy("prisma/not-a-copy.db"), /COPY_OUTSIDE_ALLOWED_ROOT/);
  await assert.rejects(
    alignSQLiteCopy("tmp/phase10f-c/not-real.db", {
      allowProtected: true,
      backupPath: "backups/phase10f-d/missing.db"
    }),
    /REAL_CONFIRMATION_TARGET_MISMATCH/
  );
});

test("le client Prisma lit toutes les formes AssetFile sans P2022", async (t) => {
  const target = await copy("prisma");
  await alignSQLiteCopy(target);
  const prisma = new PrismaClient({
    datasourceUrl: `file:${target.replaceAll("\\", "/")}?mode=ro`,
    errorFormat: "minimal"
  });
  t.after(async () => {
    await prisma.$disconnect();
    await rm(target, { force: true });
  });

  assert.equal(await prisma.assetFile.count(), 0);
  assert.deepEqual(await prisma.assetFile.findMany(), []);
  assert.equal(await prisma.assetFile.findFirst(), null);
  const unit = await prisma.assetUnit.findFirst({ include: { assetFiles: true } });
  assert.ok(unit);
  assert.deepEqual(unit.assetFiles, []);
  const individual = await prisma.assetUnit.findUnique({
    where: { id: unit.id },
    include: { assetFiles: true }
  });
  assert.deepEqual(individual.assetFiles, []);
  assert.deepEqual(await prisma.assetFile.findMany({
    select: {
      id: true, filePath: true, createdAt: true, deletedAt: true
    }
  }), []);
  assert.deepEqual(await prisma.assetFile.findMany({
    select: {
      storageProvider: true,
      storageBucket: true,
      storageKey: true,
      updatedAt: true
    }
  }), []);
});
