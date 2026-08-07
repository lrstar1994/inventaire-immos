"use client";

import { useActionState } from "react";

import { signupAction } from "@/app/connexion/actions";

const INITIAL_STATE = Object.freeze({ success: false, code: null });

const messages = Object.freeze({
  invalid_input: "Vérifiez le nom, l’adresse email et utilisez un mot de passe d’au moins 8 caractères.",
  password_mismatch: "Les deux mots de passe ne correspondent pas.",
  account_exists: "Un compte utilise déjà cette adresse. Essayez de vous connecter.",
  registration_unavailable: "L’inscription est temporairement indisponible.",
  access_request_incomplete: "Le compte Auth a pu être créé, mais la demande d’accès n’a pas abouti. Contactez la Direction.",
  email_confirmation_required: "Votre compte est créé. Confirmez votre adresse email, puis connectez-vous ; votre demande restera en attente de validation."
});

export default function SignupForm({ returnTo = "/" }) {
  const [state, formAction, pending] = useActionState(signupAction, INITIAL_STATE);
  const message = state.code ? messages[state.code] || messages.registration_unavailable : null;
  return (
    <form action={formAction} className="auth-form">
      <input name="returnTo" type="hidden" value={returnTo} />
      <label htmlFor="signup-name">Nom</label>
      <input autoComplete="name" id="signup-name" maxLength={160} name="name" required />
      <label htmlFor="signup-email">Adresse email</label>
      <input autoComplete="email" id="signup-email" maxLength={254} name="email" required type="email" />
      <label htmlFor="signup-password">Mot de passe</label>
      <input autoComplete="new-password" id="signup-password" minLength={8} maxLength={1024} name="password" required type="password" />
      <label htmlFor="signup-password-confirmation">Confirmer le mot de passe</label>
      <input autoComplete="new-password" id="signup-password-confirmation" minLength={8} maxLength={1024} name="passwordConfirmation" required type="password" />
      {message ? <p aria-live="polite" className={state.success ? "auth-notice" : "auth-error"} role={state.success ? "status" : "alert"}>{message}</p> : null}
      <button className="button primary" disabled={pending || state.success} type="submit">{pending ? "Création…" : "Créer mon compte"}</button>
    </form>
  );
}
