import { jsonError, jsonOk } from "@/lib/api";
import { getRequestUser } from "@/lib/request-user";
import { canManageMovements } from "@/lib/roles";
import { auditMovement, auditMovementUnitLocationUpdates, validateMovement } from "@/lib/movement-service";

export async function POST(request, { params }) {
  const actor = await getRequestUser(request);
  if (!actor || !canManageMovements(actor.role)) {
    return jsonError("Droits insuffisants pour valider un mouvement.", 403);
  }

  try {
    const { id } = await params;
    const movement = await validateMovement(id, actor);
    await auditMovement("ASSET_MOVEMENT_VALIDATED", movement, actor, { lineCount: movement.lines.length });
    await auditMovementUnitLocationUpdates(movement, actor);
    return jsonOk({ movement });
  } catch (error) {
    return jsonError(error.message || "Validation impossible.", error.status || 400);
  }
}
