"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { accountExists } from "@/lib/auth/account-exists";
import { hasPendingClaim, isDefaultLandingTarget } from "@/lib/purchases/pending-claim";
import { CAPTCHA_FAILED_MESSAGE, captchaTokenFrom, isCaptchaError } from "@/lib/captcha";
import {
  RATE_LIMITS,
  RATE_LIMIT_MESSAGES,
  clearRateLimit,
  getRequestIp,
  hitRateLimits,
  undoRateLimits,
} from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email("Bitte eine gültige E-Mail-Adresse angeben."),
  password: z.string().min(1, "Passwort eingeben."),
  next: z.string().optional(),
});

const CLAIM_ROUTE = "/kauf-einloesen";

function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export type LoginState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
  /** Ziel, das der Browser per voller Navigation aufrufen muss. */
  redirectTo?: string;
};

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    const fieldErrors: LoginState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "email" | "password";
      fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  // PROJ-17: Jeder Versuch wird vorab gezählt, damit parallele Anfragen das
  // Limit nicht umgehen. Zählen soll am Ende nur ein falsches Passwort.
  const ipCheck = { rule: RATE_LIMITS.loginIp, identifier: await getRequestIp() };
  const accountCheck = { rule: RATE_LIMITS.loginAccount, identifier: parsed.data.email };
  const limit = await hitRateLimits([ipCheck, accountCheck]);
  if (limit.unavailable) return { error: RATE_LIMIT_MESSAGES.unavailable };
  if (!limit.allowed) return { error: RATE_LIMIT_MESSAGES.login };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { captchaToken: captchaTokenFrom(formData) },
  });

  if (error) {
    if (error.code === "invalid_credentials") {
      // Das CAPTCHA ist hier bestanden, und der Versuch bleibt gezählt. So
      // lässt sich nicht massenhaft abfragen, welche Adressen ein Konto haben.
      const exists = await accountExists(parsed.data.email);
      if (exists === false) return { error: "Zu dieser E-Mail gibt es noch kein Konto." };
      if (exists === true) return { error: "Das Passwort stimmt leider nicht." };
      return { error: "E-Mail oder Passwort falsch." };
    }
    await undoRateLimits([ipCheck, accountCheck]);
    if (isCaptchaError(error)) return { error: CAPTCHA_FAILED_MESSAGE };
    // Supabase meldet das nur nach einem richtigen Passwort, verrät also
    // keinem Fremden, ob es die Adresse gibt.
    if (error.code === "email_not_confirmed") {
      return { error: "Bitte bestätigen Sie zuerst Ihre E-Mail." };
    }
    return { error: RATE_LIMIT_MESSAGES.unavailable };
  }

  // Der Zähler der IP wird nur um diesen Versuch verringert, nicht gelöscht:
  // Sonst könnte jemand mit dem eigenen Konto seine Fehlversuche an fremden
  // Konten immer wieder zurücksetzen.
  await undoRateLimits([ipCheck]);
  await clearRateLimit(accountCheck);

  // Kauf ohne Konto: Wartet ein bezahlter Kauf auf dieses Konto, wird er
  // jetzt zugeordnet — auch bei Bestandskunden, die schon ein Projekt haben.
  //
  // /kauf-einloesen ist eine Route, die Cookies liest und setzt. Ein
  // redirect() aus der Server Action würde sie nur intern aufrufen — ohne das
  // Cookie des Mail-Links und ohne dass ihre Weiterleitung im Browser ankommt
  // (Live-Test 4b). Deshalb navigiert hier der Browser selbst.
  const target = safeNext(parsed.data.next);
  if (
    target.split("?")[0] === CLAIM_ROUTE ||
    (data.user && isDefaultLandingTarget(target) && (await hasPendingClaim(data.user)))
  ) {
    return { redirectTo: CLAIM_ROUTE };
  }

  redirect(target);
}

const resendSchema = z.object({
  email: z.string().email("Bitte eine gültige E-Mail-Adresse angeben."),
});

export type ResendState = {
  success?: boolean;
  error?: string;
};

export async function resendConfirmAction(
  _prev: ResendState,
  formData: FormData,
): Promise<ResendState> {
  const parsed = resendSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige E-Mail." };
  }

  // PROJ-17: Über dem Limit sieht die Antwort aus wie immer, es geht nur keine
  // Mail raus (kein Rückschluss darauf, ob die Adresse existiert).
  const emailCheck = { rule: RATE_LIMITS.resendEmail, identifier: parsed.data.email };
  const limit = await hitRateLimits([
    { rule: RATE_LIMITS.resendIp, identifier: await getRequestIp() },
    emailCheck,
  ]);
  if (limit.unavailable) return { error: RATE_LIMIT_MESSAGES.unavailable };
  if (!limit.allowed) return { success: true };

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Never surface whether the email exists.
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
      captchaToken: captchaTokenFrom(formData),
    },
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
