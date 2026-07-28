import { spawn } from "node:child_process";
import path from "node:path";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const env = await loadSupabaseEnv();
const args = process.argv.slice(2);
if (!args.length) throw new Error("Commande Prisma obligatoire.");

const prismaCli = path.resolve(process.cwd(), "node_modules", "prisma", "build", "index.js");
const child = spawn(process.execPath, [prismaCli, ...args], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    SUPABASE_DIRECT_URL: env.SUPABASE_DIRECT_URL,
    SUPABASE_DATABASE_URL: env.SUPABASE_DATABASE_URL,
    DATABASE_SCHEMA: "immos"
  },
  stdio: "inherit"
});
child.on("exit", (code) => process.exit(code ?? 1));
