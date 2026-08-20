import { APP_PERMISSIONS } from "@/lib/authorization";
import { authorizeApiRequest } from "@/lib/authorization-http";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { addEquipmentSetComponent } from "@/lib/equipment-set-service";

export async function POST(request, { params }) {
  const authorization = await authorizeApiRequest(APP_PERMISSIONS.ASSETS_WRITE);
  if (authorization.response) return authorization.response;
  try {
    const component = await addEquipmentSetComponent((await params).id, await readJson(request), authorization.user);
    return jsonOk({ component }, { status: 201 });
  } catch (error) {
    return jsonError(error.message || "Ajout du composant impossible.", error.status || 400, { code: error.code || "EQUIPMENT_SET_COMPONENT_FAILED" });
  }
}
