import "server-only";
import { Resend } from "resend";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import crypto from "node:crypto";

// PROJ-11 — Resend-Mailer Server-Singleton.
//
// CRITICAL: dieser Client darf NIE in ein Client-Bundle. `import "server-only"`
// erzwingt Build-Errors bei versehentlichem Import in einer Client-Komponente.
//
// Env-Variablen (siehe .env.local.example):
//   RESEND_API_KEY        — Resend-API-Schlüssel (Produktion: re_…)
//   EMAIL_FROM            — From-Header, z. B. "narravit <no-reply@mail.narravit.de>"
//                           (Absender muss auf der in Resend verifizierten
//                           Domain mail.narravit.de liegen)
//   EMAIL_TEST_RECIPIENT  — falls gesetzt: ALLE Mails gehen an diese Adresse
//                           (Override für stage + lokal). In Vercel-Production
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
    process.env.EMAIL_FROM ?? "narravit <no-reply@mail.narravit.de>"
  );
}

/**
 * Resolves the actual recipient. In stage/local environments, the
 * `EMAIL_TEST_RECIPIENT` override redirects every mail to a single test
 * inbox to avoid leaking test-data into real inboxes.
 *
 * In der Vercel-Produktionsumgebung wird der Override ignoriert: Ist die
 * Variable dort versehentlich gesetzt, gingen sonst alle Kunden-Mails an
 * die Testadresse.
 */
function resolveRecipient(to: string): { to: string; redirected: boolean } {
  const override = process.env.EMAIL_TEST_RECIPIENT?.trim();
  if (override && override.length > 0) {
    if (process.env.VERCEL_ENV === "production") {
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
  | { ok: false; error: string; redirected: boolean };

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
    html = await render(input.react);
    text = await render(input.react, { plainText: true });
  } catch (err) {
    return {
      ok: false,
      error: `render failed: ${err instanceof Error ? err.message : String(err)}`,
      redirected: recipientCheck.redirected,
    };
  }

  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: recipient,
      subject: sanitizeSubject(input.subject),
      html,
      text,
      tags: input.tags,
    });
    if (error) {
      return {
        ok: false,
        error: error.message ?? String(error),
        redirected: recipientCheck.redirected,
      };
    }
    return {
      ok: true,
      messageId: data?.id ?? null,
      redirected: recipientCheck.redirected,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      redirected: recipientCheck.redirected,
    };
  }
}

/**
 * Resolves the site URL (used for absolute links in mails).
 * Falls back to a sensible default for prod.
 */
export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://app.narravit.de"
  );
}
