import "server-only";
import crypto from "node:crypto";
import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// PROJ-17 — zentrale Rate-Limits.
//
// Die Zähler liegen in Supabase (`rate_limit_counters`), gezählt wird atomar
// in der Datenbank. IP- und E-Mail-Adressen kommen dort nur als Hash an.
//
// Reihenfolge in einer Action: Eingabe prüfen → Limit → Supabase-Aufruf.

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type RateLimitRule = {
  scope: string;
  limit: number;
  windowSeconds: number;
};

export const RATE_LIMITS = {
  loginIp: { scope: "login_ip", limit: 5, windowSeconds: 15 * MINUTE },
  loginAccount: { scope: "login_account", limit: 10, windowSeconds: HOUR },
  resetIp: { scope: "reset_ip", limit: 3, windowSeconds: HOUR },
  resetEmail: { scope: "reset_email", limit: 3, windowSeconds: HOUR },
  resendIp: { scope: "resend_ip", limit: 3, windowSeconds: HOUR },
  resendEmail: { scope: "resend_email", limit: 3, windowSeconds: HOUR },
  register: { scope: "register_ip", limit: 10, windowSeconds: HOUR },
  accountReset: { scope: "account_reset", limit: 3, windowSeconds: HOUR },
  checkout: { scope: "checkout_ip", limit: 20, windowSeconds: HOUR },
  invitation: { scope: "invitation_project", limit: 20, windowSeconds: DAY },
} as const satisfies Record<string, RateLimitRule>;

export const RATE_LIMIT_MESSAGES = {
  login: "Zu viele Versuche. Bitte warten Sie 15 Minuten oder setzen Sie Ihr Passwort zurück.",
  register: "Zu viele Registrierungsversuche. Bitte versuchen Sie es später erneut.",
  checkout: "Zu viele Versuche. Bitte versuchen Sie es in einer Stunde erneut.",
  invitation: "Für heute wurden zu viele Einladungen verschickt. Bitte versuchen Sie es morgen erneut.",
  unavailable: "Das hat gerade nicht geklappt. Bitte versuchen Sie es in einigen Minuten erneut.",
} as const;

export type RateLimitCheck = { rule: RateLimitRule; identifier: string };
export type RateLimitResult = {
  allowed: boolean;
  /** Die Zählung selbst ist fehlgeschlagen (Datenbank nicht erreichbar). */
  unavailable: boolean;
};

/**
 * Kunden-IP aus den Headern von Vercel. Vercel überschreibt sie, Clients
 * können sie nicht fälschen. Der erste Eintrag ist der Client.
 */
export function getClientIp(source: Pick<Headers, "get">): string {
  const raw = source.get("x-vercel-forwarded-for") ?? source.get("x-forwarded-for") ?? "";
  return raw.split(",")[0]?.trim() || "unknown";
}

export async function getRequestIp(): Promise<string> {
  return getClientIp(await headers());
}

/** Nur außerhalb von Production abschaltbar, etwa für lokale Entwicklung. */
function isDisabled(): boolean {
  return process.env.RATE_LIMIT_DISABLED === "true" && process.env.VERCEL_ENV !== "production";
}

/**
 * Nicht rückrechenbarer Hash der Kennung. Der geheime Schlüssel ist nötig,
 * weil sich IPv4-Adressen sonst einfach durchprobieren ließen.
 */
function hashIdentifier(identifier: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt");
  return crypto
    .createHmac("sha256", key)
    .update(`rate-limit:v1:${identifier.trim().toLowerCase()}`)
    .digest("hex");
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Zählt die Versuche der Reihe nach und stoppt beim ersten überschrittenen
 * Limit. Die IP gehört deshalb nach vorn: Eine gesperrte IP erhöht so nicht
 * mehr den Zähler eines fremden Kontos. Wirft nie.
 */
export async function hitRateLimits(checks: RateLimitCheck[]): Promise<RateLimitResult> {
  if (isDisabled()) return { allowed: true, unavailable: false };

  try {
    const supabase = createServiceRoleClient();
    for (const { rule, identifier } of checks) {
      const hash = hashIdentifier(identifier);
      const { data, error } = await supabase.rpc("rate_limit_hit", {
        p_scope: rule.scope,
        p_identifier_hash: hash,
        p_limit: rule.limit,
        p_window_seconds: rule.windowSeconds,
      });
      const row = data?.[0];
      if (error || !row) {
        console.error(
          `[rate-limit] ${rule.scope} check failed: ${error?.message ?? "keine Antwort"}`,
        );
        return { allowed: false, unavailable: true };
      }
      if (!row.is_allowed) {
        console.warn(
          JSON.stringify({ event: "rate_limit_hit", scope: rule.scope, id: hash.slice(0, 12) }),
        );
        return { allowed: false, unavailable: false };
      }
    }
    return { allowed: true, unavailable: false };
  } catch (err) {
    console.error(`[rate-limit] check failed: ${errorText(err)}`);
    return { allowed: false, unavailable: true };
  }
}

/** Nimmt einen gezählten Versuch zurück, etwa nach einem erfolgreichen Login. Wirft nie. */
export async function undoRateLimits(checks: RateLimitCheck[]): Promise<void> {
  if (isDisabled()) return;
  try {
    const supabase = createServiceRoleClient();
    for (const { rule, identifier } of checks) {
      const { error } = await supabase.rpc("rate_limit_undo", {
        p_scope: rule.scope,
        p_identifier_hash: hashIdentifier(identifier),
      });
      if (error) console.error(`[rate-limit] ${rule.scope} undo failed: ${error.message}`);
    }
  } catch (err) {
    console.error(`[rate-limit] undo failed: ${errorText(err)}`);
  }
}

/** Setzt einen Zähler vollständig zurück. Wirft nie. */
export async function clearRateLimit({ rule, identifier }: RateLimitCheck): Promise<void> {
  if (isDisabled()) return;
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("rate_limit_counters")
      .delete()
      .eq("scope", rule.scope)
      .eq("identifier_hash", hashIdentifier(identifier));
    if (error) console.error(`[rate-limit] ${rule.scope} clear failed: ${error.message}`);
  } catch (err) {
    console.error(`[rate-limit] clear failed: ${errorText(err)}`);
  }
}
