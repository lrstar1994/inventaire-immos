export const AUTH_LOCALES = Object.freeze(["fr", "en"]);

const COPY = Object.freeze({
  fr: Object.freeze({
    title: "Connexion",
    email: "Adresse email",
    password: "Mot de passe",
    submit: "Se connecter",
    submitting: "Connexion en cours…",
    logout: "Se déconnecter",
    invalidCredentials: "Adresse email ou mot de passe incorrect.",
    unavailable: "Le service de connexion est temporairement indisponible.",
    sessionExpired: "Votre session a expiré.",
    alreadyConnected: "Connecté",
    connectedAs: "Connecté en tant que",
    signedOut: "Vous êtes déconnecté."
  }),
  en: Object.freeze({
    title: "Sign in",
    email: "Email address",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    logout: "Sign out",
    invalidCredentials: "Incorrect email address or password.",
    unavailable: "The sign-in service is temporarily unavailable.",
    sessionExpired: "Your session has expired.",
    alreadyConnected: "Signed in",
    connectedAs: "Signed in as",
    signedOut: "You are signed out."
  })
});

export function normalizeAuthLocale(value) {
  return AUTH_LOCALES.includes(value) ? value : "fr";
}

export function getAuthCopy(locale) {
  return COPY[normalizeAuthLocale(locale)];
}
