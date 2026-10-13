// Hat dieses Konto (auch) eine Anmeldung per E-Mail-Adresse und Passwort?
//
// Supabase liefert im User-Objekt keine direkte Auskunft darüber. Wir
// leiten es aus drei Signalen ab:
//   1. Das Konto wurde per E-Mail registriert (`provider === "email"`).
//   2. Unter den verknüpften Anmeldewegen ist „email".
//   3. Das Konto wurde per Google/Facebook angelegt und hat später über
//      unser Reset-Formular ein Passwort festgelegt — das Formular setzt
//      dabei den Marker `has_password` in den Nutzer-Metadaten.
//
// Der Wert steuert nur die Beschriftung im persönlichen Bereich
// („Passwort festlegen" vs. „Passwort ändern"), keine Berechtigung.

type UserLike = {
  app_metadata?: { provider?: unknown; providers?: unknown } | null;
  user_metadata?: { has_password?: unknown } | null;
};

export function hasPasswordLogin(user: UserLike): boolean {
  const provider = user.app_metadata?.provider;
  if (provider === undefined || provider === null || provider === "email") {
    return true;
  }
  const providers = user.app_metadata?.providers;
  if (Array.isArray(providers) && providers.includes("email")) return true;
  return user.user_metadata?.has_password === true;
}
