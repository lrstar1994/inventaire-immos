import { resolveFileStorageProviderName } from "./config.js";

export function createStorageProviderFactory({ createLocal, createSupabase }) {
  const instances = new Map();
  return function getProvider(value) {
    const name = resolveFileStorageProviderName(value);
    if (!instances.has(name)) {
      instances.set(name, name === "local" ? createLocal() : createSupabase());
    }
    return instances.get(name);
  };
}
