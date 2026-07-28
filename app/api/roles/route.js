import { ROLE_LABELS } from "@/lib/roles";
import { jsonOk } from "@/lib/api";

export async function GET() {
  return jsonOk({
    roles: Object.entries(ROLE_LABELS).map(([code, label]) => ({ code, label }))
  });
}
