import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const serverDirectory = path.join(process.cwd(), ".next", "server");
const packageFile = path.join(serverDirectory, "package.json");

await mkdir(serverDirectory, { recursive: true });

await writeFile(
  packageFile,
  `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`,
  "utf8"
);

console.log("Dossier .next/server déclaré en CommonJS pour Vercel.");