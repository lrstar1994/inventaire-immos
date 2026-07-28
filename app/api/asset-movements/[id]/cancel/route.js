import { jsonError, jsonOk, readJson } from "@/lib/api";
import { getRequestUser } from "@/lib/request-user";
import { canManageMovements } from "@/lib/roles";
import { auditMovement, cancelMovement } from "@/lib/movement-service";

export async function POST(request, { params }) {
  const actor = await getRequestUser(request);
  if (!actor || !canManageMovements(actor.role)) {
    return jsonError("Droits insuffisants pour annuler un mouvement.", 403);
  }

  try {
    const { id } = await params;
    const body = await readJson(request);
    const reason = String(body.reason || "").trim();
    const movement = await cancelMovement(id, reason, actor);
    await auditMovement("ASSET_MOVEMENT_CANCELLED", movement, actor, { reason });
    return jsonOk({ movement });
  } catch (error) {
    return jsonError(error.message || "Annulation impossible.", error.status || 400);
  }
}
