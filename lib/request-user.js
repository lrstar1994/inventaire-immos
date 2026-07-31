import { requireAuthorizedUser } from "@/lib/authorization";

export async function getRequestUser(_request, options) {
  return requireAuthorizedUser(options);
}
