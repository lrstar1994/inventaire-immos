import "server-only";

import { getSupabaseServerAuthClient } from "./server-client.js";
import { normalizeInternalReturnPath } from "./safe-redirect.js";

const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MAX_LENGTH = 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LOGIN_RESULT_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  INVALID_CREDENTIALS: "invalid_credentials",
  AUTHENTICATION_UNAVAILABLE: "authentication_unavailable"
});

function publicFailure(code) {
  return Object.freeze({ success: false, code });
}

function fieldValue(formData, name) {
  const value = formData?.get?.(name);
  return typeof value === "string" ? value : null;
}

export function validateLoginInput(formData) {
  const emailValue = fieldValue(formData, "email");
  const password = fieldValue(formData, "password");
  const returnTo = fieldValue(formData, "returnTo");
  const email = emailValue?.trim() || "";
  if (
    !email ||
    email.length > EMAIL_MAX_LENGTH ||
    !EMAIL_PATTERN.test(email) ||
    !password ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    return { valid: false, returnTo: normalizeInternalReturnPath(returnTo) };
  }
  return {
    valid: true,
    email,
    password,
    returnTo: normalizeInternalReturnPath(returnTo)
  };
}

function isCredentialFailure(error) {
  return [400, 401, 403, 422].includes(Number(error?.status));
}

export async function executeLogin({
  formData,
  client,
  clientFactory = getSupabaseServerAuthClient
}) {
  const input = validateLoginInput(formData);
  if (!input.valid) {
    return publicFailure(LOGIN_RESULT_CODES.INVALID_INPUT);
  }

  try {
    const authClient = client || await clientFactory();
    const { error } = await authClient.auth.signInWithPassword({
      email: input.email,
      password: input.password
    });
    if (error) {
      return publicFailure(
        isCredentialFailure(error)
          ? LOGIN_RESULT_CODES.INVALID_CREDENTIALS
          : LOGIN_RESULT_CODES.AUTHENTICATION_UNAVAILABLE
      );
    }
    return Object.freeze({ success: true, returnTo: input.returnTo });
  } catch {
    return publicFailure(LOGIN_RESULT_CODES.AUTHENTICATION_UNAVAILABLE);
  }
}

export async function executeLogout({
  client,
  clientFactory = getSupabaseServerAuthClient
} = {}) {
  try {
    const authClient = client || await clientFactory();
    const { error } = await authClient.auth.signOut({ scope: "local" });
    return Object.freeze({
      success: !error,
      code: error ? "logout_unavailable" : null
    });
  } catch {
    return Object.freeze({ success: false, code: "logout_unavailable" });
  }
}
