import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient as SQLitePrismaClient } from "../generated/prisma-lot6/index.js";
import { PrismaClient as ProductionPrismaClient } from "../generated/prisma-postgresql/index.js";
import { PrismaClient as RecipePrismaClient } from "../generated/prisma-recipe/index.js";
import { loadSupabaseEnv } from "./supabase-env.mjs";

const PROTECTED_SQLITE_SHA256 = "8c9dcce5b820b383e8ba6a4f3c0c33d536220fe997847e3a3b6277ec6fc4aaec";
const protectedSQLitePath = path.resolve(process.cwd(), "prisma/dev.db");
const sqlitePath = process.env.PHASE10F_PARITY_SQLITE_PATH
  ? path.resolve(process.cwd(), process.env.PHASE10F_PARITY_SQLITE_PATH)
  : protectedSQLitePath;
const expectedSQLiteSha256 = process.env.PHASE10F_PARITY_SQLITE_SHA256 || PROTECTED_SQLITE_SHA256;
const mutationOperations = new Set([
  "create", "createMany", "createManyAndReturn", "delete", "deleteMany",
  "update", "updateMany", "updateManyAndReturn", "upsert"
]);

function guarded(client) {
  return client.$extends({
    query: {
      $allModels: {
        $allOperations({ operation, args, query }) {
          if (mutationOperations.has(operation)) {
            throw new Error(`READ_ONLY_GUARD:${operation}`);
          }
          return query(args);
        }
      }
    }
  });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeError(error) {
  return {
    code: typeof error?.code === "string" ? error.code : null,
    column: typeof error?.meta?.column === "string" ? error.meta.column : null,
    modelName: typeof error?.meta?.modelName === "string" ? error.meta.modelName : null,
    type: error?.constructor?.name || "Error"
  };
}

function resultShape(value) {
  const rows = Array.isArray(value) ? value : [value].filter(Boolean);
  return {
    count: Array.isArray(value) ? value.length : (typeof value === "number" ? value : rows.length),
    keys: rows[0] && typeof rows[0] === "object" ? Object.keys(rows[0]).sort() : []
  };
}

const scenarios = [
  {
    id: "auth_profile_and_role",
    area: "Authentification et autorisation",
    paths: ["lib/request-user.js", "lib/authorization.js"],
    run: (p) => p.user.findFirst({
      where: { deletedAt: null },
      select: { id: true, externalAuthId: true, role: true, status: true }
    })
  },
  {
    id: "dashboard_counters",
    area: "Tableau de bord",
    paths: ["app/page.js"],
    run: async (p) => ({
      assetUnits: await p.assetUnit.count({ where: { deletedAt: null } }),
      draftDocuments: await p.assetDocument.count({ where: { status: "DRAFT" } }),
      unitsWithPrimaryPhoto: await p.assetUnit.count({
        where: { deletedAt: null, assetFiles: { some: { deletedAt: null, isPrimary: true } } }
      })
    })
  },
  {
    id: "asset_list_search_filter_sort_pagination",
    area: "Immobilisations",
    paths: ["app/parc/page.js", "app/api/asset-units/route.js"],
    run: (p) => p.assetUnit.findMany({
      where: { deletedAt: null, assetCode: { contains: "" } },
      orderBy: { assetCode: "asc" },
      skip: 0,
      take: 5,
      select: {
        id: true, assetCode: true, condition: true, status: true,
        assetItem: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } }
      }
    })
  },
  {
    id: "asset_detail_without_files",
    area: "Immobilisations",
    paths: ["app/api/asset-units/[id]/route.js"],
    run: (p) => p.assetUnit.findFirst({
      where: { deletedAt: null },
      select: {
        id: true, assetCode: true, condition: true, status: true,
        assetItem: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        entry: { select: { id: true, entryNumber: true } }
      }
    })
  },
  {
    id: "asset_detail_with_implicit_files",
    area: "Immobilisations et fichiers",
    paths: ["app/parc/page.js", "app/api/asset-units/route.js", "app/api/asset-units/[id]/route.js"],
    run: (p) => p.assetUnit.findFirst({
      where: { deletedAt: null },
      include: { assetFiles: { where: { deletedAt: null } } }
    })
  },
  {
    id: "asset_files_count",
    area: "Fichiers",
    paths: ["app/page.js", "scripts de contrôle"],
    run: (p) => p.assetFile.count()
  },
  {
    id: "asset_files_implicit_all_columns",
    area: "Fichiers",
    paths: ["app/api/asset-files/route.js", "app/api/asset-units/[id]/files/route.js"],
    run: (p) => p.assetFile.findMany({ orderBy: { createdAt: "desc" } })
  },
  {
    id: "asset_file_implicit_unique",
    area: "Fichiers",
    paths: ["app/api/asset-files/[id]/route.js", "lib/asset-file-service.js"],
    run: (p) => p.assetFile.findFirst({ where: { deletedAt: null } })
  },
  {
    id: "asset_files_explicit_legacy_columns",
    area: "Fichiers",
    paths: ["diagnostic explicite"],
    run: (p) => p.assetFile.findMany({
      select: {
        id: true, assetUnitId: true, fileType: true, fileLabel: true,
        fileName: true, filePath: true, mimeType: true, fileSize: true,
        isPrimary: true, notes: true, createdById: true, createdAt: true, deletedAt: true
      }
    })
  },
  {
    id: "references",
    area: "Référentiels",
    paths: ["app/api/asset-options/route.js"],
    run: async (p) => ({
      categories: await p.assetCategory.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      sites: await p.location.findMany({ select: { id: true, name: true, parentId: true }, orderBy: { name: "asc" } }),
      suppliers: await p.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      users: await p.user.findMany({ where: { deletedAt: null }, select: { id: true, role: true, status: true } })
    })
  },
  {
    id: "entries",
    area: "Entrées",
    paths: ["app/api/asset-entries/route.js"],
    run: (p) => p.assetEntry.findMany({
      take: 5,
      orderBy: { entryDate: "desc" },
      include: { assetItem: true, location: true, supplier: true }
    })
  },
  {
    id: "movements",
    area: "Mouvements",
    paths: ["app/mouvements/page.js", "app/api/asset-movements/route.js"],
    run: (p) => p.assetMovement.findMany({
      take: 5,
      orderBy: { movementDate: "desc" },
      include: { lines: true, relatedMovement: true }
    })
  },
  {
    id: "documents",
    area: "Documents",
    paths: ["app/documents/page.js", "app/api/asset-documents/route.js"],
    run: (p) => p.assetDocument.findMany({
      take: 5,
      orderBy: { documentDate: "desc" },
      include: { entries: true, lines: true }
    })
  }
];

async function runScenarios(client) {
  const output = {};
  for (const scenario of scenarios) {
    try {
      const value = await scenario.run(client);
      output[scenario.id] = { ok: true, shape: resultShape(value) };
    } catch (error) {
      output[scenario.id] = { ok: false, error: safeError(error) };
    }
  }
  return output;
}

function classify(sqlite, recipe) {
  if (sqlite.ok && recipe.ok) {
    return sqlite.shape.count === recipe.shape.count
      ? "PARITÉ CONFIRMÉE"
      : "PARITÉ CONFIRMÉE AVEC DIFFÉRENCE DE DONNÉES ATTENDUE";
  }
  if (!sqlite.ok && sqlite.error.code === "P2022") return "BLOQUÉ PAR P2022";
  return "BLOQUÉ PAR UNE AUTRE INCOMPATIBILITÉ";
}

function classifyTriple(sqlite, recipe, production) {
  if (sqlite.ok && recipe.ok && production.ok) {
    return sqlite.shape.count === recipe.shape.count &&
      recipe.shape.count === production.shape.count
      ? "PARITY_CONFIRMED"
      : "PARITY_CONFIRMED_WITH_EXPECTED_DATA_DIFFERENCE";
  }
  if (
    (!sqlite.ok && sqlite.error.code === "P2022") ||
    (!recipe.ok && recipe.error.code === "P2022") ||
    (!production.ok && production.error.code === "P2022")
  ) return "BLOCKED_BY_P2022";
  return "BLOCKED_BY_OTHER_INCOMPATIBILITY";
}

const before = sha256(await readFile(sqlitePath));
if (before !== expectedSQLiteSha256) throw new Error("Empreinte SQLite initiale inattendue.");

const env = await loadSupabaseEnv();
const recipeUrl = new URL(env.SUPABASE_DIRECT_URL);
recipeUrl.searchParams.set("schema", "immos_recipe_phase8");
recipeUrl.searchParams.set("sslmode", "require");
const productionUrl = new URL(env.SUPABASE_DIRECT_URL);
productionUrl.searchParams.set("schema", "immos");
productionUrl.searchParams.set("sslmode", "require");

const sqliteBase = new SQLitePrismaClient({
  datasourceUrl: `file:${sqlitePath.replaceAll("\\", "/")}?mode=ro`,
  errorFormat: "minimal"
});
const recipeBase = new RecipePrismaClient({
  datasourceUrl: recipeUrl.toString(),
  errorFormat: "minimal"
});
const productionBase = new ProductionPrismaClient({
  datasourceUrl: productionUrl.toString(),
  errorFormat: "minimal"
});
const sqlite = guarded(sqliteBase);
const recipe = guarded(recipeBase);
const production = guarded(productionBase);

try {
  const sqliteResults = await runScenarios(sqlite);
  const recipeEnvelope = await recipe.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const [state] = await tx.$queryRawUnsafe("SHOW transaction_read_only");
    if (state.transaction_read_only !== "on") {
      throw new Error("La transaction Recipe n'est pas en lecture seule.");
    }
    return {
      transactionReadOnly: state.transaction_read_only,
      results: await runScenarios(tx)
    };
  }, { maxWait: 10_000, timeout: 120_000 });
  const productionEnvelope = await production.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const [state] = await tx.$queryRawUnsafe("SHOW transaction_read_only");
    if (state.transaction_read_only !== "on") {
      throw new Error("La transaction Production n'est pas en lecture seule.");
    }
    return {
      transactionReadOnly: state.transaction_read_only,
      results: await runScenarios(tx)
    };
  }, { maxWait: 10_000, timeout: 120_000 });
  const after = sha256(await readFile(sqlitePath));
  if (after !== before) throw new Error("SQLite a été modifiée pendant le diagnostic.");

  const matrix = scenarios.map((scenario) => ({
    id: scenario.id,
    area: scenario.area,
    paths: scenario.paths,
    classification: classifyTriple(
      sqliteResults[scenario.id],
      recipeEnvelope.results[scenario.id],
      productionEnvelope.results[scenario.id]
    ),
    sqlite: sqliteResults[scenario.id],
    recipe: recipeEnvelope.results[scenario.id],
    production: productionEnvelope.results[scenario.id]
  }));
  console.log(JSON.stringify({
    result: "READ_ONLY_PARITY_MAPPED",
    protections: {
      sqliteSha256Before: before,
      sqliteSha256After: after,
      sqliteDatabase: path.relative(process.cwd(), sqlitePath).replaceAll("\\", "/"),
      sqliteDatasourceMode: "ro",
      recipeTransactionReadOnly: recipeEnvelope.transactionReadOnly,
      productionTransactionReadOnly: productionEnvelope.transactionReadOnly,
      prismaMutationGuard: true
    },
    clients: {
      sqlite: "generated/prisma-lot6",
      recipe: "generated/prisma-recipe",
      production: "generated/prisma-postgresql"
    },
    matrix
  }, null, 2));
} finally {
  await sqliteBase.$disconnect();
  await recipeBase.$disconnect();
  await productionBase.$disconnect();
}
