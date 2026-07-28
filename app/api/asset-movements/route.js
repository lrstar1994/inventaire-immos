import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { getRequestUser } from "@/lib/request-user";
import { canCreateMovementDraft } from "@/lib/roles";
import { auditMovement, createMovement, movementInclude } from "@/lib/movement-service";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const where = {};
  if (searchParams.get("movementStatus")) where.movementStatus = searchParams.get("movementStatus");
  if (searchParams.get("movementType")) where.movementType = searchParams.get("movementType");

  const movements = await prisma.assetMovement.findMany({
    where,
    include: movementInclude(),
    orderBy: { movementDate: "desc" }
  });

  return jsonOk({ movements });
}

export async function POST(request) {
  const actor = await getRequestUser(request);
  if (!actor || !canCreateMovementDraft(actor.role)) {
    return jsonError("Droits insuffisants pour creer un mouvement.", 403);
  }

  try {
    const body = await readJson(request);
    const movement = await createMovement(body, actor);
    await auditMovement("ASSET_MOVEMENT_CREATED", movement, actor, { lineCount: movement.lines.length });
    for (const line of movement.lines) {
      await auditMovement("ASSET_MOVEMENT_LINE_ADDED", movement, actor, { assetUnitId: line.assetUnitId });
    }
    return jsonOk({ movement }, { status: 201 });
  } catch (error) {
    return jsonError(error.message || "Creation impossible.", error.status || 400);
  }
}
