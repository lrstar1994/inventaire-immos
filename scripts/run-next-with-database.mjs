import { spawn } from "node:child_process";
import path from "node:path";

const [provider, command] = process.argv.slice(2);
if (!["sqlite", "postgresql"].includes(provider)) {
  throw new Error("Backend invalide. Valeurs autorisées : sqlite, postgresql.");
}
if (!["dev", "build", "start"].includes(command)) {
  throw new Error("Commande Next.js invalide. Valeurs autorisées : dev, build, start.");
}

const nextBinary = path.resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const args = command === "dev" ? ["dev", "--webpack", "-H", "0.0.0.0"] : [command];
const child = spawn(process.execPath, [nextBinary, ...args], {
  stdio: "inherit",
  env: { ...process.env, APP_DATABASE_PROVIDER: provider }
});

child.on("error", (error) => {
  console.error(`Impossible de démarrer Next.js : ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
