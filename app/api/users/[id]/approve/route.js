import { APP_PERMISSIONS } from "@/lib/authorization";
import { authorizeApiRequest } from "@/lib/authorization-http";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const allowedRoles = new Set(["DIRECTION", "INVENTORY_MANAGER", "MAINTENANCE_MANAGER", "BASIC_USER"]);

export async function POST(request, { params }) {
  const authorization = await authorizeApiRequest(APP_PERMISSIONS.USERS_MANAGE);
  if (authorization.response) return authorization.response;
  const body = await readJson(request);
  if (!allowedRoles.has(body.role)) return jsonError("Un rôle explicite valide est obligatoire.");
  const { id } = await params;

  try {
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id, status: "PENDING", deletedAt: null },
        data: { status: "ACTIVE", role: body.role, updatedById: authorization.user.id }
      });
      if (updated.count !== 1) throw new Error("PENDING_USER_NOT_FOUND");
      await tx.auditLog.create({
        data: {
          action: "USER_ACCESS_APPROVED",
          entityTable: "users",
          entityId: id,
          summary: "Validation d’une demande d’accès Inventaire Immos",
          metadata: JSON.stringify({ role: body.role }),
          userId: authorization.user.id
        }
      });
      return tx.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, role: true, status: true, createdAt: true }
      });
    });
    return jsonOk({ user });
  } catch (error) {
    if (error?.message === "PENDING_USER_NOT_FOUND") return jsonError("Demande en attente introuvable.", 404);
    return jsonError("Validation de la demande impossible.", 500);
  }
}
