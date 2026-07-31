"use client";

import { useActionState } from "react";

import { loginAction } from "./actions";

const INITIAL_STATE = Object.freeze({ success: false, code: null });

export default function LoginForm({ copy, locale, returnTo }) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_STATE);
  const message = state.code === "authentication_unavailable"
    ? copy.unavailable
    : state.code
      ? copy.invalidCredentials
      : null;

  return (
    <form action={formAction} className="auth-form">
      <input name="returnTo" type="hidden" value={returnTo} />
      <input name="locale" type="hidden" value={locale} />
      <label htmlFor="auth-email">{copy.email}</label>
      <input
        autoComplete="email"
        id="auth-email"
        maxLength={254}
        name="email"
        required
        type="email"
      />
      <label htmlFor="auth-password">{copy.password}</label>
      <input
        autoComplete="current-password"
        id="auth-password"
        maxLength={1024}
        name="password"
        required
        type="password"
      />
      {message ? (
        <p aria-live="polite" className="auth-error" role="alert">{message}</p>
      ) : null}
      <button className="button primary" disabled={pending} type="submit">
        {pending ? copy.submitting : copy.submit}
      </button>
    </form>
  );
}
