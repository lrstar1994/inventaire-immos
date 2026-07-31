import "server-only";

import { NextResponse } from "next/server";

import {
  APP_PERMISSIONS,
  AppAuthorizationError,
  requirePermission
} from "@/lib/authorization";

const PUBLIC_MESSAGES = Object.freeze({
  unauthenticated: "Authentification requise.",
  authentication_unavailable: "Service d’authentification temporairement indisponible.",
  forbidden: "Accès non autorisé à Inventaire Immos."
});

export function authorizationErrorResponse(error) {
  if (!(error instanceof AppAuthorizationError)) {
    return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
  }
  if (error.status === 401) {
    return NextResponse.json(
      { error: PUBLIC_MESSAGES.unauthenticated, code: "unauthenticated" },
      { status: 401 }
    );
  }
  if (error.status === 503) {
    return NextResponse.json(
      {
        error: PUBLIC_MESSAGES.authentication_unavailable,
        code: "authentication_unavailable"
      },
      { status: 503 }
    );
  }
  return NextResponse.json(
    { error: PUBLIC_MESSAGES.forbidden, code: error.code },
    { status: 403 }
  );
}

export async function authorizeApiRequest(
  permission = APP_PERMISSIONS.READ,
  options = {}
) {
  try {
    const user = await requirePermission(permission, options);
    return { user, response: null };
  } catch (error) {
    return { user: null, response: authorizationErrorResponse(error) };
  }
}
