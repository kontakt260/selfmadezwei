import "server-only";
import { Resend } from "resend";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import crypto from "node:crypto";
import { encodeNonAscii } from "@/emails/encoding";

export { getSiteUrl } from "@/lib/site-url";

// PROJ-11 — Resend-Mailer Server-Singleton.
//
// CRITICAL: dieser Client darf NIE in ein Client-Bundle. `import "server-only"`
// erzwingt Build-Errors bei versehentlichem Import in einer Client-Komponente.
//
// Env-Variablen (siehe .env.local.example):
//   RESEND_API_KEY        — Resend-API-Schlüssel (Produktion: re_…)
//   EMAIL_FROM            — From-Header, z. B. "NARRAVIT <no-reply@mail.narravit.de>"
//                           (Absender-Name immer in Großbuchstaben)
//                           (Absender muss auf der in Resend verifizierten
//                           Domain mail.narravit.de liegen)
//   EMAIL_TEST_RECIPIENT  — falls gesetzt: ALLE Mails gehen an diese Adresse
//                           (Override für stage + lokal). Auf app.narravit.de
//                           wird die Variable ignoriert.
//
// Versand-Verhalten:
//   - Fire-and-Forget aus Sicht der aufrufenden Action/Webhook-Route:
//     der Send-Helper hat ein internes try/catch und gibt das Result
//     als Promise zurück, das die Aufrufer mit `void` schlucken.
//   - Bei Fehler wird in der Server-Konsole geloggt (später per Sentry).
//     Wir hashen die Empfänger-Adresse vor dem Log (DSGVO-Schonung).

let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Configure server-side env-vars before " +
        "calling email-related code.",
    );
  }
  _resend = new Resend(key);
  return _resend;
}

function getFromAddress(): string {
  // Fallback auf der verifizierten Resend-Domain: narravit.de selbst ist
  // in Resend nicht eingerichtet, Mails von dort würden abgelehnt.
  return (
    process.env.EMAIL_FROM ?? "NARRAVIT <no-reply@mail.narravit.de>"
  );
}

/** Die Kunden-Domain. Nur dort wird `EMAIL_TEST_RECIPIENT` ignoriert. */
const PRODUCTION_SITE_URL = "https://app.narravit.de";

/** Ohne gesetzte Adresse gilt im Zweifel die Kunden-Domain. */
function isCustomerSite(): boolean {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  return !configured || configured === PRODUCTION_SITE_URL;
}

/**
 * Resolves the actual recipient. In stage/local environments, the
 * `EMAIL_TEST_RECIPIENT` override redirects every mail to a single test
 * inbox to avoid leaking test-data into real inboxes.
 *
 * Auf der Kunden-Domain wird der Override ignoriert: Ist die Variable dort
 * versehentlich gesetzt, gingen sonst alle Kunden-Mails an die Testadresse.
 * Bewusst an der Site-URL festgemacht und nicht an `VERCEL_ENV`: Stage kann
 * in Vercel ebenfalls als Umgebung „Production" laufen.
 */
function resolveRecipient(to: string): { to: string; redirected: boolean } {
  const override = process.env.EMAIL_TEST_RECIPIENT?.trim();
  if (override && override.length > 0) {
    if (isCustomerSite()) {
      console.warn(
        "[email] EMAIL_TEST_RECIPIENT is set in production and is ignored",
      );
      return { to, redirected: false };
    }
    return { to: override, redirected: true };
  }
  return { to, redirected: false };
}

/**
 * Betreffzeilen enthalten Nutzertext (Projekttitel, Namen). Zeilenumbrüche
 * werden entfernt, damit niemand über den Betreff zusätzliche Mail-Header
 * einschleusen kann; überlange Betreffs werden gekürzt.
 */
export function sanitizeSubject(subject: string): string {
  return subject.replace(/[\r\n]+/g, " ").trim().slice(0, 200);
}

/**
 * 8-char SHA-256-prefix of the recipient address. Used for Sentry/Log
 * lines that identify the mail by recipient without exposing it.
 */
export function hashEmailForLog(email: string): string {
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 8);
}

export type SendMailInput = {
  to: string;
  subject: string;
  /** React-Email-Komponente (z. B. <InvitationEmail … />) */
  react: ReactElement;
  /** Optional: zusätzliche Tags für Resend-Statistik. */
  tags?: Array<{ name: string; value: string }>;
};

export type SendMailResult =
  | { ok: true; messageId: string | null; redirected: boolean }
  | {
      ok: false;
      error: string;
      redirected: boolean;
      /** true = ein späterer Versuch kann klappen (Warteschlange, BUG-13). */
      retryable?: boolean;
    };

/** Wartezeiten vor dem zweiten und dritten Versuch innerhalb eines Aufrufs. */
const RETRY_DELAYS_MS = [400, 1200];

/**
 * Lohnt sich ein sofortiger zweiter Versuch? Ja bei Überlastung, Serverfehlern
 * und Netzwerkproblemen. Ein aufgebrauchtes Tages- oder Monatskontingent
 * erholt sich nicht in Sekunden, das holt die Warteschlange später nach.
 */
function isTransientSendError(error: { name?: string; statusCode?: number | null }): boolean {
  if (error.name === "rate_limit_exceeded" || error.name === "application_error") return true;
  return typeof error.statusCode === "number" && error.statusCode >= 500;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sendet eine E-Mail über Resend. NIEMALS aus dem Client aufrufen.
 *
 * Fehler werden NICHT geworfen — die Funktion gibt immer einen
 * `SendMailResult` zurück. Aufrufende Hooks (Server-Action,
 * Webhook-Route) sollen das Promise mit `void` schlucken, falls sie
 * Best-Effort-Semantik wollen.
 */
export async function sendEmail(input: SendMailInput): Promise<SendMailResult> {
  const recipientCheck = resolveRecipient(input.to);
  const recipient = recipientCheck.to;

  // Empfänger-Adress-Validierung: Basis-Format-Check. Resend selbst
  // lehnt sonst mit unklarem Fehler ab.
  if (!recipient || !recipient.includes("@") || recipient.length > 254) {
    return {
      ok: false,
      error: "Ungültige Empfänger-Adresse",
      redirected: recipientCheck.redirected,
    };
  }

  let html: string;
  let text: string;
  try {
    // HTML als reines ASCII (Umlaute als HTML-Codes), damit keine Station auf
    // dem Weg Sonderzeichen zerstören kann. Der Klartext bleibt UTF-8.
    html = encodeNonAscii(await render(input.react));
    text = await render(input.react, { plainText: true });
  } catch (err) {
    return {
      ok: false,
      error: `render failed: ${err instanceof Error ? err.message : String(err)}`,
      redirected: recipientCheck.redirected,
    };
  }

  let resend: Resend;
  try {
    resend = getResend();
  } catch (err) {
    // Fehlender Schlüssel ist eine Konfigurationsfrage (z. B. lokal), kein
    // Fall für die Warteschlange.
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      redirected: recipientCheck.redirected,
    };
  }

  const payload = {
    from: getFromAddress(),
    to: recipient,
    subject: sanitizeSubject(input.subject),
    html,
    text,
    tags: input.tags,
  };
  // Derselbe Schlüssel für alle Versuche: Kam ein Versuch trotz Fehlermeldung
  // bei Resend an, verschickt Resend die Mail kein zweites Mal.
  const idempotencyKey = crypto.randomUUID();

  for (let attempt = 0; ; attempt += 1) {
    try {
      const { data, error } = await resend.emails.send(payload, { idempotencyKey });
      if (!error) {
        return {
          ok: true,
          messageId: data?.id ?? null,
          redirected: recipientCheck.redirected,
        };
      }
      if (attempt < RETRY_DELAYS_MS.length && isTransientSendError(error)) {
        await wait(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      return {
        ok: false,
        error: error.message ?? String(error),
        redirected: recipientCheck.redirected,
        retryable: true,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        redirected: recipientCheck.redirected,
        retryable: true,
      };
    }
  }
}
