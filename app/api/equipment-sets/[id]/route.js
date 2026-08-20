import { APP_PERMISSIONS } from "@/lib/authorization";
import { authorizeApiRequest } from "@/lib/authorization-http";
import { jsonError, jsonOk } from "@/lib/api";
import { disableEquipmentSet, getEquipmentSet } from "@/lib/equipment-set-service";

export async function GET(_request, { params }) {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const equipmentSet = await getEquipmentSet((await params).id);
  return equipmentSet ? jsonOk({ equipmentSet }) : jsonError("Ensemble introuvable.", 404);
}

export async function DELETE(_request, { params }) {
  const authorization = await authorizeApiRequest(APP_PERMISSIONS.ASSETS_WRITE);
  if (authorization.response) return authorization.response;
  try {
    const equipmentSet = await disableEquipmentSet((await params).id, authorization.user);
    return jsonOk({ equipmentSet });
  } catch (error) {
    return jsonError(error.message || "Désactivation impossible.", error.status || 400, { code: error.code || "EQUIPMENT_SET_DISABLE_FAILED" });
  }
}
