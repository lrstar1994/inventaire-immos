import { PrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const RECIPE_SCHEMA = "immos_recipe_phase8";
const MODES = new Set(["link", "unlink"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseRecipeAuthLinkArguments(argv) {
  const values = new Map();
  for (const argument of argv) {
    const match = argument.match(/^--([^=]+)=(.*)$/);
    if (!match || values.has(match[1])) throw new Error("Arguments invalides ou dupliqués.");
    values.set(match[1], match[2]);
  }
  const action = values.get("action");
  const authUserId = values.get("auth-user-id");
  const userId = values.get("user-id");
  const execute = values.get("confirm") === "RECIPE_ONLY";
  const restoreAuthProvider = values.get("restore-auth-provider") || "local-seed";

  if (!MODES.has(action)) throw new Error("Action attendue : link ou unlink.");
  if (!UUID_PATTERN.test(authUserId || "")) throw new Error("UUID Auth invalide.");
  if (!userId || userId.length > 128) throw new Error("User cible invalide.");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(restoreAuthProvider)) {
    throw new Error("Provider de restauration invalide.");
  }
  return { action, authUserId, userId, execute, restoreAuthProvider };
}

export function assertRecipeConnectionUrl(rawUrl) {
  const target = new URL(rawUrl);
  if (!["postgres:", "postgresql:"].includes(target.protocol)) {
    throw new Error("La liaison Auth exige PostgreSQL.");
  }
  target.searchParams.set("schema", RECIPE_SCHEMA);
  target.searchParams.set("pgbouncer", "true");
  target.searchParams.set("connection_limit", "1");
  return target.toString();
}

export async function planRecipeAuthLink({ prisma, action, authUserId, userId }) {
  const [schemaRow] = await prisma.$queryRawUnsafe("SELECT current_schema() AS schema");
  if (schemaRow?.schema !== RECIPE_SCHEMA) {
    throw new Error("Garde-fou recette déclenché : schéma actif inattendu.");
  }

  const [target, conflicting] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.user.findMany({
      where: { externalAuthId: authUserId, NOT: { id: userId } },
      select: { id: true },
      take: 2
    })
  ]);
  if (!target || target.deletedAt) throw new Error("User cible de recette introuvable.");
  if (conflicting.length) throw new Error("UUID Auth déjà associé à une autre ligne.");

  if (action === "link") {
    if (target.externalAuthId && target.externalAuthId !== authUserId) {
      throw new Error("La ligne cible possède déjà un autre UUID Auth.");
    }
    return {
      action,
      userId,
      role: target.role,
      status: target.status,
      currentAuthProvider: target.authProvider,
      noChange: target.externalAuthId === authUserId && target.authProvider === "supabase"
    };
  }

  if (target.externalAuthId !== authUserId || target.authProvider !== "supabase") {
    throw new Error("La liaison exacte à retirer n’existe pas.");
  }
  return {
    action,
    userId,
    role: target.role,
    status: target.status,
    currentAuthProvider: target.authProvider,
    noChange: false
  };
}

export async function executeRecipeAuthLink({
  prisma,
  action,
  authUserId,
  userId,
  restoreAuthProvider
}) {
  const plan = await planRecipeAuthLink({ prisma, action, authUserId, userId });
  if (plan.noChange) return { ...plan, executed: false };

  const where = action === "link"
    ? { id: userId, externalAuthId: null }
    : { id: userId, externalAuthId: authUserId, authProvider: "supabase" };
  const data = action === "link"
    ? { externalAuthId: authUserId, authProvider: "supabase" }
    : { externalAuthId: null, authProvider: restoreAuthProvider };
  const result = await prisma.user.updateMany({ where, data });
  if (result.count !== 1) throw new Error("La liaison a changé pendant la revalidation.");
  return { ...plan, executed: true };
}

async function main() {
  const options = parseRecipeAuthLinkArguments(process.argv.slice(2));
  const env = await loadSupabaseEnv();
  const prisma = new PrismaClient({
    datasourceUrl: assertRecipeConnectionUrl(env.SUPABASE_DATABASE_URL),
    errorFormat: "minimal"
  });
  try {
    const plan = await planRecipeAuthLink({ prisma, ...options });
    if (!options.execute) {
      console.log(JSON.stringify({
        mode: "dry_run",
        action: plan.action,
        userId: plan.userId,
        role: plan.role,
        status: plan.status,
        eligible: true
      }));
      return;
    }
    const result = await executeRecipeAuthLink({ prisma, ...options });
    console.log(JSON.stringify({
      mode: "execute",
      action: result.action,
      userId: result.userId,
      role: result.role,
      status: result.status,
      executed: result.executed
    }));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll("\\", "/")}`).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Échec contrôlé.");
    process.exitCode = 1;
  });
}
