import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { canManageUsers } from "@/lib/roles";
import { getRequestUser } from "@/lib/request-user";
import { writeAuditLog } from "@/lib/audit";

const allowedRoles = ["DIRECTION", "INVENTORY_MANAGER", "MAINTENANCE_MANAGER", "BASIC_USER"];

export async function GET(_request, { params }) {
  const { id } = await params;
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      authProvider: true,
      externalAuthId: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!user) {
    return jsonError("Utilisateur introuvable.", 404);
  }

  return jsonOk({ user });
}

export async function PATCH(request, { params }) {
  const actor = await getRequestUser(request);

  if (!actor || !canManageUsers(actor.role)) {
    return jsonError("Droits insuffisants pour modifier un utilisateur.", 403);
  }

  const { id } = await params;
  const body = await readJson(request);
  const data = { updatedById: actor.id };

  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.email !== undefined) data.email = String(body.email).trim().toLowerCase();
  if (body.status !== undefined) data.status = body.status === "DISABLED" ? "DISABLED" : "ACTIVE";
  if (body.role !== undefined) {
    if (!allowedRoles.includes(body.role)) {
      return jsonError("Role utilisateur invalide.");
    }
    data.role = body.role;
  }
  if (body.externalAuthId !== undefined) data.externalAuthId = body.externalAuthId || null;
  if (body.authProvider !== undefined) data.authProvider = body.authProvider || "local";

  const user = await prisma.user.update({
    where: { id },
    data
  });

  await writeAuditLog({
    action: "USER_UPDATED",
    entityTable: "users",
    entityId: user.id,
    summary: `Modification de l'utilisateur ${user.email}`,
    metadata: data,
    userId: actor.id
  });

  return jsonOk({ user });
}

export async function DELETE(request, { params }) {
  const actor = await getRequestUser(request);

  if (!actor || !canManageUsers(actor.role)) {
    return jsonError("Droits insuffisants pour desactiver un utilisateur.", 403);
  }

  const { id } = await params;
  const user = await prisma.user.update({
    where: { id },
    data: {
      status: "DISABLED",
      deletedAt: new Date(),
      updatedById: actor.id
    }
  });

  await writeAuditLog({
    action: "USER_DISABLED",
    entityTable: "users",
    entityId: user.id,
    summary: `Desactivation de l'utilisateur ${user.email}`,
    userId: actor.id
  });

  return jsonOk({ user });
}
