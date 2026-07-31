import { APP_PERMISSIONS } from "@/lib/authorization";
import { authorizeApiRequest } from "@/lib/authorization-http";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { canManageUsers } from "@/lib/roles";
import { getRequestUser } from "@/lib/request-user";
import { writeAuditLog } from "@/lib/audit";

const allowedRoles = ["DIRECTION", "INVENTORY_MANAGER", "MAINTENANCE_MANAGER", "BASIC_USER"];

export async function GET() {
  const authorization = await authorizeApiRequest(APP_PERMISSIONS.USERS_MANAGE);
  if (authorization.response) return authorization.response;
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
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

  return jsonOk({ users });
}

export async function POST(request) {
  const authorization = await authorizeApiRequest(APP_PERMISSIONS.USERS_MANAGE);
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);

  if (!actor || !canManageUsers(actor.role)) {
    return jsonError("Droits insuffisants pour creer un utilisateur.", 403);
  }

  const body = await readJson(request);
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const role = body.role || "BASIC_USER";

  if (!email || !name) {
    return jsonError("Les champs email et name sont obligatoires.");
  }

  if (!allowedRoles.includes(role)) {
    return jsonError("Role utilisateur invalide.");
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      role,
      status: body.status === "DISABLED" ? "DISABLED" : "ACTIVE",
      authProvider: body.authProvider || "local",
      externalAuthId: body.externalAuthId || null,
      createdById: actor.id,
      updatedById: actor.id
    }
  });

  await writeAuditLog({
    action: "USER_CREATED",
    entityTable: "users",
    entityId: user.id,
    summary: `Creation de l'utilisateur ${user.email}`,
    metadata: { role: user.role, status: user.status },
    userId: actor.id
  });

  return jsonOk({ user }, { status: 201 });
}
