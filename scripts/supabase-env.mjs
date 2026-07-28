import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadSupabaseEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const text = await readFile(envPath, "utf8");
  const values = {};

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }

  const required = [
    "DATABASE_URL",
    "SUPABASE_DATABASE_URL",
    "SUPABASE_DIRECT_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_STORAGE_BUCKET",
    "DATABASE_SCHEMA"
  ];
  const missing = required.filter((name) => !values[name]);
  if (missing.length) throw new Error(`Variables manquantes : ${missing.join(", ")}`);
  if (values.DATABASE_URL !== "file:./dev.db") throw new Error("DATABASE_URL doit rester SQLite.");
  if (values.DATABASE_SCHEMA !== "immos") throw new Error("DATABASE_SCHEMA doit valoir immos.");
  if (values.SUPABASE_STORAGE_BUCKET !== "asset-files") throw new Error("Le bucket attendu est asset-files.");
  for (const name of ["SUPABASE_DATABASE_URL", "SUPABASE_DIRECT_URL"]) {
    const url = new URL(values[name]);
    if (url.searchParams.get("schema") !== "immos") throw new Error(`${name} doit contenir schema=immos.`);
    if (url.searchParams.get("sslmode") !== "require") throw new Error(`${name} doit contenir sslmode=require.`);
  }
  return values;
}
