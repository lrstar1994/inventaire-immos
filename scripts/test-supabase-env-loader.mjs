import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadSupabaseEnv } from "./supabase-env.mjs";

const required = Object.freeze({
  DATABASE_URL: "file:./dev.db",
  SUPABASE_DATABASE_URL: "postgresql://user:fake-password@example.invalid:6543/postgres?schema=immos&sslmode=require",
  SUPABASE_DIRECT_URL: "postgresql://user:fake-password@example.invalid:5432/postgres?schema=immos&sslmode=require",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "phase11a-public-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "phase11a-server-test-key",
  SUPABASE_STORAGE_BUCKET: "asset-files",
  DATABASE_SCHEMA: "immos"
});

function serialize(values) {
  return Object.entries(values).map(([name, value]) => `${name}=${value}`).join("\n");
}

async function withDirectory(callback) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "phase11a-env-"));
  try {
    return await callback(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test(".env.local présent reste chargé en local", async () => withDirectory(async (cwd) => {
  await writeFile(path.join(cwd, ".env.local"), serialize(required));
  const values = await loadSupabaseEnv({ cwd, env: {} });
  assert.equal(values.SUPABASE_DATABASE_URL, required.SUPABASE_DATABASE_URL);
}));

test(".env.local absent utilise directement process.env", async () => withDirectory(async (cwd) => {
  const values = await loadSupabaseEnv({ cwd, env: { ...required } });
  assert.equal(values.DATABASE_SCHEMA, "immos");
}));

test(".env.local absent conserve une erreur explicite si une variable obligatoire manque", async () => withDirectory(async (cwd) => {
  const { SUPABASE_DATABASE_URL: _missing, ...incomplete } = required;
  await assert.rejects(
    loadSupabaseEnv({ cwd, env: incomplete }),
    (error) => error instanceof Error &&
      error.message.includes("SUPABASE_DATABASE_URL") &&
      !error.message.includes("fake-password")
  );
}));

test("process.env est prioritaire sur .env.local et .env", async () => withDirectory(async (cwd) => {
  const stale = { ...required, SUPABASE_STORAGE_BUCKET: "stale-bucket" };
  await writeFile(path.join(cwd, ".env"), serialize(stale));
  await writeFile(path.join(cwd, ".env.local"), serialize(stale));
  const values = await loadSupabaseEnv({ cwd, env: { ...required } });
  assert.equal(values.SUPABASE_STORAGE_BUCKET, "asset-files");
}));

test("les erreurs de validation ne contiennent aucune valeur sensible", async () => withDirectory(async (cwd) => {
  const secret = "phase11a-do-not-leak";
  await assert.rejects(
    loadSupabaseEnv({
      cwd,
      env: { ...required, SUPABASE_DATABASE_URL: `postgresql://user:${secret}@example.invalid:6543/postgres` }
    }),
    (error) => error instanceof Error && !error.message.includes(secret)
  );
}));

test("le build PostgreSQL génère le client avant le prévol", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("./run-next-with-database.mjs", import.meta.url), "utf8")
  );
  const generateIndex = source.indexOf('"generate"');
  const preflightIndex = source.indexOf("preflight-postgresql-production.mjs");
  assert.ok(generateIndex >= 0 && preflightIndex > generateIndex);
  assert.match(source, /prisma["\s,]+"postgresql["\s,]+"schema\.prisma/);
});
