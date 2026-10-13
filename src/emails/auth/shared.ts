// Supabase-Auth-Vorlagen („Confirm signup", „Reset password").
//
// Diese Mails verschickt Supabase selbst (über das dort hinterlegte SMTP),
// nicht unsere App. Die Vorlagen werden hier mit demselben Layout wie die
// PROJ-11-Mails gebaut und als statisches HTML nach `supabase/templates/`
// geschrieben; von dort werden sie im Supabase-Dashboard eingefügt
// (Authentication → Emails → Templates).
//
// Die Platzhalter in doppelten geschweiften Klammern ersetzt Supabase beim
// Versand (Go-Template-Syntax).

export type AuthLinkType = "email" | "recovery";

/**
 * Link-Ziel der Buttons. `{{ .RedirectTo }}` ist die Rücksprung-Adresse, die
 * unsere App beim Auslösen mitgibt (`…/auth/callback?next=…`). Sie enthält
 * immer bereits ein „?" — deshalb wird der Token mit „&" angehängt. Die
 * Route `/auth/callback` bestätigt ihn serverseitig (verifyOtp).
 *
 * Vorteil gegenüber `{{ .ConfirmationURL }}`: Der Link zeigt auf unsere
 * eigene Domain statt auf supabase.co und funktioniert auch in einem anderen
 * Browser oder auf einem anderen Gerät als dem, auf dem er angefordert wurde.
 */
export function authLink(type: AuthLinkType): string {
  return `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=${type}`;
}

/**
 * Go-Template-Kommentar: wird beim Versand ersatzlos entfernt. Im
 * Supabase-Dashboard durch die Pflichtangaben für Geschäftsbriefe ersetzen.
 */
export const LEGAL_PLACEHOLDER =
  "{{/* Pflichtangaben hier eintragen: Firma und Rechtsform, Anschrift, Registergericht und Registernummer, Vertretungsberechtigte */}}";

export const AUTH_TEMPLATE_SUBJECTS = {
  "confirm-signup": "Bitte bestätigen Sie Ihre E-Mail-Adresse",
  "reset-password": "Neues Passwort für Ihr NARRAVIT-Konto festlegen",
} as const;
