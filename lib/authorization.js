import "server-only";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/supabase/session";

export const APP_ROLES = Object.freeze({
  ADMIN: "admin",
  MANAGER: "gestionnaire",
  READ_ONLY: "lecture_seule"
});

export const APP_PERMISSIONS = Object.freeze({
  READ: "app.read",
  ASSETS_WRITE: "assets.write",
  DOCUMENTS_WRITE: "documents.write",
  MOVEMENTS_CREATE: "movements.create",
  MOVEMENTS_MANAGE: "movements.manage",
  FILES_UPLOAD: "files.upload",
  FILES_MANAGE: "files.manage",
  REFERENTIALS_WRITE: "referentials.write",
  USERS_MANAGE: "users.manage"
});

const ROLE_PROFILES = Object.freeze({
  DIRECTION: Object.freeze({
    appRole: APP_ROLES.ADMIN,
    permissions: Object.freeze(Object.values(APP_PERMISSIONS))
  }),
  INVENTORY_MANAGER: Object.freeze({
    appRole: APP_ROLES.MANAGER,
    permissions: Object.freeze([
      APP_PERMISSIONS.READ,
      APP_PERMISSIONS.ASSETS_WRITE,
      APP_PERMISSIONS.DOCUMENTS_WRITE,
      APP_PERMISSIONS.MOVEMENTS_CREATE,
      APP_PERMISSIONS.MOVEMENTS_MANAGE,
      APP_PERMISSIONS.FILES_UPLOAD,
      APP_PERMISSIONS.FILES_MANAGE,
      APP_PERMISSIONS.REFERENTIALS_WRITE
    ])
  }),
  MAINTENANCE_MANAGER: Object.freeze({
    appRole: APP_ROLES.MANAGER,
    permissions: Object.freeze([
      APP_PERMISSIONS.READ,
      APP_PERMISSIONS.MOVEMENTS_CREATE,
      APP_PERMISSIONS.FILES_UPLOAD
    ])
  }),
  BASIC_USER: Object.freeze({
    appRole: APP_ROLES.READ_ONLY,
    permissions: Object.freeze([APP_PERMISSIONS.READ])
  })
});

export class AppAuthorizationError extends Error {
  constructor(code, { status = 403, cause } = {}) {
    super(`Accès Inventaire Immos refusé (${code}).`, { cause });
    this.name = "AppAuthorizationError";
    this.code = code;
    this.status = status;
  }
}

function publicAppUser(user, profile) {
  return Object.freeze({
    id: user.id,
    authUserId: user.externalAuthId,
    name: user.name,
    appRole: profile.appRole,
    role: user.role,
    sourceRole: user.role,
    permissions: profile.permissions
  });
}

export function hasPermission(appUser, permission) {
  return Boolean(appUser?.permissions?.includes(permission));
}

export async function getCurrentAppUser({
  authUser,
  getAuthUser = getCurrentUser,
  prismaClient = prisma
} = {}) {
  let resolvedAuthUser = authUser;
  if (resolvedAuthUser === undefined) {
    try {
      resolvedAuthUser = await getAuthUser();
    } catch (cause) {
      throw new AppAuthorizationError("authentication_unavailable", {
        status: 503,
        cause
      });
    }
  }
  if (!resolvedAuthUser?.id) {
    return Object.freeze({ status: "unauthenticated", user: null });
  }

  let matches;
  try {
    matches = await prismaClient.user.findMany({
      where: {
        authProvider: "supabase",
        externalAuthId: resolvedAuthUser.id
      },
      take: 2
    });
  } catch (cause) {
    throw new AppAuthorizationError("authorization_unavailable", {
      status: 503,
      cause
    });
  }
  if (matches.length === 0) {
    return Object.freeze({ status: "not_authorized", user: null });
  }
  if (matches.length !== 1) {
    return Object.freeze({ status: "invalid_membership", user: null });
  }

  const user = matches[0];
  if (user.deletedAt) {
    return Object.freeze({ status: "inactive", user: null });
  }
  if (user.status === "PENDING") {
    return Object.freeze({ status: "pending", user: null });
  }
  if (user.status !== "ACTIVE") return Object.freeze({ status: "inactive", user: null });

  const profile = ROLE_PROFILES[user.role];
  if (!profile) {
    return Object.freeze({ status: "invalid_role", user: null });
  }

  return Object.freeze({
    status: "authorized",
    user: publicAppUser(user, profile)
  });
}

export async function requireAuthenticatedUser(options = {}) {
  const authUser = options.authUser === undefined
    ? await (options.getAuthUser || getCurrentUser)()
    : options.authUser;
  if (!authUser?.id) {
    throw new AppAuthorizationError("unauthenticated", { status: 401 });
  }
  return authUser;
}

export async function requireAuthorizedUser(options = {}) {
  const result = await getCurrentAppUser(options);
  if (result.status === "unauthenticated") {
    throw new AppAuthorizationError("unauthenticated", { status: 401 });
  }
  if (result.status !== "authorized") {
    throw new AppAuthorizationError(result.status, { status: 403 });
  }
  return result.user;
}

export async function requireRole(role, options = {}) {
  const user = await requireAuthorizedUser(options);
  if (user.appRole !== role) {
    throw new AppAuthorizationError("insufficient_role", { status: 403 });
  }
  return user;
}

export async function requirePermission(permission, options = {}) {
  const user = await requireAuthorizedUser(options);
  if (!hasPermission(user, permission)) {
    throw new AppAuthorizationError("insufficient_role", { status: 403 });
  }
  return user;
}
