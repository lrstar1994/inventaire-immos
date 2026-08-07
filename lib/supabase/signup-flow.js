import "server-only";

import { prisma } from "@/lib/prisma";

import { getSupabaseServerAuthClient } from "./server-client.js";
import { normalizeInternalReturnPath } from "./safe-redirect.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX_LENGTH = 160;
const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 1024;

export const SIGNUP_RESULT_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  PASSWORD_MISMATCH: "password_mismatch",
  ACCOUNT_EXISTS: "account_exists",
  REGISTRATION_UNAVAILABLE: "registration_unavailable",
  ACCESS_REQUEST_INCOMPLETE: "access_request_incomplete"
});

function value(formData, name) {
  const entry = formData?.get?.(name);
  return typeof entry === "string" ? entry : null;
}

function failure(code) {
  return Object.freeze({ success: false, code });
}

export function validateSignupInput(formData) {
  const name = value(formData, "name")?.trim() || "";
  const email = value(formData, "email")?.trim().toLowerCase() || "";
  const password = value(formData, "password") || "";
  const passwordConfirmation = value(formData, "passwordConfirmation") || "";
  const returnTo = normalizeInternalReturnPath(value(formData, "returnTo"));

  if (!name || name.length > NAME_MAX_LENGTH || !email || email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    return { valid: false, code: SIGNUP_RESULT_CODES.INVALID_INPUT, returnTo };
  }
  if (password !== passwordConfirmation) {
    return { valid: false, code: SIGNUP_RESULT_CODES.PASSWORD_MISMATCH, returnTo };
  }
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return { valid: false, code: SIGNUP_RESULT_CODES.INVALID_INPUT, returnTo };
  }
  return { valid: true, name, email, password, returnTo };
}

async function createPendingUser(prismaClient, { authUserId, email, name }) {
  return prismaClient.$transaction(async (tx) => {
    const duplicate = await tx.user.findFirst({
      where: { OR: [{ email }, { externalAuthId: authUserId }] },
      select: { id: true }
    });
    if (duplicate) return null;
    return tx.user.create({
      data: {
        email,
        name,
        role: "BASIC_USER",
        status: "PENDING",
        authProvider: "supabase",
        externalAuthId: authUserId
      },
      select: { id: true, status: true }
    });
  });
}

export async function executeSignup({
  formData,
  client,
  clientFactory = getSupabaseServerAuthClient,
  prismaClient = prisma
}) {
  const input = validateSignupInput(formData);
  if (!input.valid) return failure(input.code);

  try {
    const existing = await prismaClient.user.findFirst({
      where: { email: input.email },
      select: { id: true }
    });
    if (existing) return failure(SIGNUP_RESULT_CODES.ACCOUNT_EXISTS);
  } catch {
    return failure(SIGNUP_RESULT_CODES.REGISTRATION_UNAVAILABLE);
  }

  let authResult;
  try {
    const authClient = client || await clientFactory();
    authResult = await authClient.auth.signUp({ email: input.email, password: input.password });
  } catch {
    return failure(SIGNUP_RESULT_CODES.REGISTRATION_UNAVAILABLE);
  }

  if (authResult.error) {
    const status = Number(authResult.error.status);
    return failure([400, 409, 422].includes(status)
      ? SIGNUP_RESULT_CODES.ACCOUNT_EXISTS
      : SIGNUP_RESULT_CODES.REGISTRATION_UNAVAILABLE);
  }

  const authUser = authResult.data?.user;
  if (!authUser?.id || (Array.isArray(authUser.identities) && authUser.identities.length === 0)) {
    return failure(SIGNUP_RESULT_CODES.ACCOUNT_EXISTS);
  }

  try {
    const pendingUser = await createPendingUser(prismaClient, {
      authUserId: authUser.id,
      email: input.email,
      name: input.name
    });
    if (!pendingUser) return failure(SIGNUP_RESULT_CODES.ACCOUNT_EXISTS);
  } catch {
    return failure(SIGNUP_RESULT_CODES.ACCESS_REQUEST_INCOMPLETE);
  }

  return Object.freeze({
    success: true,
    code: authResult.data?.session ? "pending" : "email_confirmation_required",
    returnTo: input.returnTo
  });
}
