import { APP_PERMISSIONS } from "@/lib/authorization";
import { authorizeApiRequest } from "@/lib/authorization-http";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { createEquipmentSet, listEquipmentSets } from "@/lib/equipment-set-service";

export async function GET() {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  return jsonOk({ equipmentSets: await listEquipmentSets() });
}

export async function POST(request) {
  const authorization = await authorizeApiRequest(APP_PERMISSIONS.ASSETS_WRITE);
  if (authorization.response) return authorization.response;
  try {
    const equipmentSet = await createEquipmentSet(await readJson(request), authorization.user);
    return jsonOk({ equipmentSet }, { status: 201 });
  } catch (error) {
    return jsonError(error.message || "Création de l'ensemble impossible.", error.status || 400, { code: error.code || "EQUIPMENT_SET_CREATE_FAILED" });
  }
}
