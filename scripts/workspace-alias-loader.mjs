import { existsSync, statSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
  const base = resolvePath(process.cwd(), specifier.slice(2));
  const candidate = existsSync(base) && statSync(base).isFile() ? base : existsSync(`${base}.js`) ? `${base}.js` : resolvePath(base, "index.js");
  return { url: pathToFileURL(candidate).href, shortCircuit: true };
}
