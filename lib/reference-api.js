import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { authorizeApiRequest } from "@/lib/authorization-http";
import { writeAuditLog } from "@/lib/audit";
import { canManageReferentials } from "@/lib/roles";
import { getRequestUser } from "@/lib/request-user";

function normalizeText(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function statusValue(value) {
  return value === "DISABLED" ? "DISABLED" : "ACTIVE";
}

function pickData(body, fields) {
  const data = {};

  for (const field of fields) {
    if (body[field] !== undefined) {
      data[field] = normalizeText(body[field]);
    }
  }

  if (body.status !== undefined) {
    data.status = statusValue(body.status);
  }

  return data;
}

function includeConfig(kind) {
  if (kind === "locations") {
    return { parent: { select: { id: true, name: true, code: true } } };
  }
  if (kind === "asset_categories") {
    return { parent: { select: { id: true, name: true, code: true, hierarchyLevel: true } } };
  }
  if (kind === "asset_items") {
    return {
      category: { select: { id: true, name: true, code: true, hierarchyLevel: true, trackingMode: true, controlLevel: true } },
      supplier: { select: { id: true, name: true, code: true } }
    };
  }
  return undefined;
}

export function createListHandler({ model, table, include, searchable = ["name"] }) {
  return async function GET(request) {
    const authorization = await authorizeApiRequest();
    if (authorization.response) return authorization.response;
    const { searchParams } = new URL(request.url);
    const includeDisabled = searchParams.get("includeDisabled") === "true";
    const query = normalizeText(searchParams.get("q"));

    const where = {
      deletedAt: null,
      ...(includeDisabled ? {} : { status: "ACTIVE" })
    };

    if (query) {
      where.OR = searchable.map((field) => ({
        [field]: { contains: query }
      }));
    }

    const items = await prisma[model].findMany({
      where,
      include: include || includeConfig(table),
      orderBy: [{ name: "asc" }]
    });

    return jsonOk({ items });
  };
}

export function createPostHandler({ model, table, required = ["name"], fields, auditName, validate, returnInclude, transactionalAudit = false, uniqueConflictMessage }) {
  return async function POST(request) {
    const authorization = await authorizeApiRequest();
    if (authorization.response) return authorization.response;
    const actor = await getRequestUser(request);
    if (!actor || !canManageReferentials(actor.role)) {
      return jsonError("Droits insuffisants pour modifier les referentiels.", 403);
    }

    const body = await readJson(request);
    for (const field of required) {
      if (!normalizeText(body[field])) {
        return jsonError(`Le champ ${field} est obligatoire.`);
      }
    }

    let data = {
      ...pickData(body, fields),
      createdById: actor.id,
      updatedById: actor.id
    };

    if (validate) {
      try {
        data = { ...data, ...(await validate({ prismaClient: prisma, body })) };
      } catch (error) {
        return jsonError(error.message || "Référentiel invalide.", error.status || 400);
      }
    }

    if (body.displayOrder !== undefined) {
      data.displayOrder = Number.parseInt(body.displayOrder, 10) || 0;
    }
    if (body.depreciationYears !== undefined) {
      data.depreciationYears = body.depreciationYears ? Number.parseInt(body.depreciationYears, 10) : null;
    }

    try {
      const createItem = async (client) => {
        const item = await client[model].create({ data, ...(returnInclude ? { include: returnInclude } : {}) });
        if (transactionalAudit) {
          await client.auditLog.create({ data: { action: `${table.toUpperCase()}_CREATED`, entityTable: table, entityId: item.id, summary: `Creation ${auditName}: ${item.name}`, metadata: JSON.stringify({ code: item.code || null }), userId: actor.id } });
        }
        return item;
      };
      const item = transactionalAudit ? await prisma.$transaction(createItem) : await createItem(prisma);
      if (!transactionalAudit) {
        await writeAuditLog({ action: `${table.toUpperCase()}_CREATED`, entityTable: table, entityId: item.id, summary: `Creation ${auditName}: ${item.name}`, metadata: { code: item.code || null }, userId: actor.id });
      }
      return jsonOk({ item }, { status: 201 });
    } catch (error) {
      if (error?.code === "P2002" && uniqueConflictMessage) return jsonError(uniqueConflictMessage, 409);
      throw error;
    }
  };
}

export function createGetByIdHandler({ model, table, include }) {
  return async function GET(_request, { params }) {
    const authorization = await authorizeApiRequest();
    if (authorization.response) return authorization.response;
    const { id } = await params;
    const item = await prisma[model].findFirst({
      where: { id, deletedAt: null },
      include: include || includeConfig(table)
    });

    if (!item) {
      return jsonError("Element introuvable.", 404);
    }

    return jsonOk({ item });
  };
}

export function createPatchHandler({ model, table, fields, auditName, validate }) {
  return async function PATCH(request, { params }) {
    const authorization = await authorizeApiRequest();
    if (authorization.response) return authorization.response;
    const actor = await getRequestUser(request);
    if (!actor || !canManageReferentials(actor.role)) {
      return jsonError("Droits insuffisants pour modifier les referentiels.", 403);
    }

    const { id } = await params;
    const body = await readJson(request);
    let data = {
      ...pickData(body, fields),
      updatedById: actor.id
    };

    if (validate) {
      try {
        data = { ...data, ...(await validate({ prismaClient: prisma, body, id })) };
      } catch (error) {
        return jsonError(error.message || "Référentiel invalide.", error.status || 400);
      }
    }

    if (body.displayOrder !== undefined) {
      data.displayOrder = Number.parseInt(body.displayOrder, 10) || 0;
    }
    if (body.depreciationYears !== undefined) {
      data.depreciationYears = body.depreciationYears ? Number.parseInt(body.depreciationYears, 10) : null;
    }

    const item = await prisma[model].update({ where: { id }, data });

    await writeAuditLog({
      action: `${table.toUpperCase()}_UPDATED`,
      entityTable: table,
      entityId: item.id,
      summary: `Modification ${auditName}: ${item.name}`,
      metadata: data,
      userId: actor.id
    });

    return jsonOk({ item });
  };
}

export function createDeleteHandler({ model, table, auditName }) {
  return async function DELETE(request, { params }) {
    const authorization = await authorizeApiRequest();
    if (authorization.response) return authorization.response;
    const actor = await getRequestUser(request);
    if (!actor || !canManageReferentials(actor.role)) {
      return jsonError("Droits insuffisants pour modifier les referentiels.", 403);
    }

    const { id } = await params;
    const item = await prisma[model].update({
      where: { id },
      data: {
        status: "DISABLED",
        deletedAt: new Date(),
        updatedById: actor.id
      }
    });

    await writeAuditLog({
      action: `${table.toUpperCase()}_DISABLED`,
      entityTable: table,
      entityId: item.id,
      summary: `Desactivation ${auditName}: ${item.name}`,
      userId: actor.id
    });

    return jsonOk({ item });
  };
}
