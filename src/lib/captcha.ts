// PROJ-17 — Token der Sicherheitsprüfung (Cloudflare Turnstile).
//
// Das Widget legt das Token in dieses Formularfeld. Geprüft wird es von
// Supabase Auth, sobald dort CAPTCHA eingeschaltet ist.

const TOKEN_FIELD = "cf-turnstile-response";
const MAX_TOKEN_LENGTH = 4096;

export const CAPTCHA_FAILED_MESSAGE =
  "Die Sicherheitsprüfung ist fehlgeschlagen. Bitte versuchen Sie es erneut.";

export function captchaTokenFrom(formData: FormData): string | undefined {
  const value = formData.get(TOKEN_FIELD);
  if (typeof value !== "string") return undefined;
  const token = value.trim();
  return token && token.length <= MAX_TOKEN_LENGTH ? token : undefined;
}

export function isCaptchaError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "captcha_failed";
}
