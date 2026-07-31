import { APP_PERMISSIONS } from "@/lib/authorization";
import { authorizeApiRequest } from "@/lib/authorization-http";
import { ROLE_LABELS } from "@/lib/roles";
import { jsonOk } from "@/lib/api";

export async function GET() {
  const authorization = await authorizeApiRequest(APP_PERMISSIONS.USERS_MANAGE);
  if (authorization.response) return authorization.response;
  return jsonOk({
    roles: Object.entries(ROLE_LABELS).map(([code, label]) => ({ code, label }))
  });
}
