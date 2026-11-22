"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { CAPTCHA_FAILED_MESSAGE, captchaTokenFrom, isCaptchaError } from "@/lib/captcha";
import { submittedText } from "@/lib/form-values";
import {
  RATE_LIMITS,
  RATE_LIMIT_MESSAGES,
  getRequestIp,
  hitRateLimits,
  undoRateLimits,
} from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email("Bitte eine gültige E-Mail-Adresse angeben."),
});

export type ForgotPasswordState = {
  success?: boolean;
  error?: string;
  fieldErrors?: { email?: string };
  /** Bleibt nach einem Fehler im Feld stehen. */
  email?: string;
};

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const result = await requestPasswordReset(formData);
  return result.success ? result : { ...result, email: submittedText(formData, "email") };
}

async function requestPasswordReset(formData: FormData): Promise<ForgotPasswordState> {
  const parsed = schema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return {
      fieldErrors: { email: parsed.error.issues[0]?.message },
    };
  }

  // PROJ-17: Über dem Limit sieht die Antwort aus wie immer, es geht nur keine
  // Mail raus (kein Rückschluss darauf, ob die Adresse existiert).
  const emailCheck = { rule: RATE_LIMITS.resetEmail, identifier: parsed.data.email };
  const limit = await hitRateLimits([
    { rule: RATE_LIMITS.resetIp, identifier: await getRequestIp() },
    emailCheck,
  ]);
  if (limit.unavailable) return { error: RATE_LIMIT_MESSAGES.unavailable };
  if (!limit.allowed) return { success: true };

  const supabase = await createClient();
  const origin = getSiteUrl();

  // We intentionally don't surface whether the email exists to prevent user
  // enumeration. Route through /auth/callback so the recovery code is
  // exchanged for a session before the user lands on the reset form.
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/passwort-zuruecksetzen`,
    captchaToken: captchaTokenFrom(formData),
  });
  if (isCaptchaError(error)) {
    // Ohne bestandene Prüfung ging keine Mail raus. Der Zähler der Adresse darf
    // nicht steigen, sonst ließen sich fremde Adressen sperren. Der Zähler der
    // IP bleibt und bremst weiter massenhafte Versuche.
    await undoRateLimits([emailCheck]);
    return { error: CAPTCHA_FAILED_MESSAGE };
  }

  return { success: true };
}
