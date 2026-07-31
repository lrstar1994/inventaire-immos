import { authorizeApiRequest } from "@/lib/authorization-http";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { getRequestUser } from "@/lib/request-user";
import { canManageMovements } from "@/lib/roles";
import { auditMovement, movementInclude, updateMovement } from "@/lib/movement-service";

export async function GET(_request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const { id } = await params;
  const movement = await prisma.assetMovement.findUnique({ where: { id }, include: movementInclude() });
  if (!movement) return jsonError("Mouvement introuvable.", 404);
  return jsonOk({ movement });
}

export async function PATCH(request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const actor = await getRequestUser(request);
  if (!actor || !canManageMovements(actor.role)) {
    return jsonError("Droits insuffisants pour modifier un mouvement.", 403);
  }

  try {
    const { id } = await params;
    const body = await readJson(request);
    const movement = await updateMovement(id, body, actor);
    await auditMovement("ASSET_MOVEMENT_UPDATED", movement, actor);
    return jsonOk({ movement });
  } catch (error) {
    return jsonError(error.message || "Modification impossible.", error.status || 400);
  }
}
