import "server-only";
import { sendEmail, getSiteUrl, type SendMailResult } from "./client";
import { recordMailResult } from "./retry-queue";
import { InvitationEmail } from "@/emails/InvitationEmail";

// PROJ-11 — Einladungs-Mail-Versand.
//
// Trigger: createInvitationAction nach erfolgreicher invitations-Row-Insert
// (über `sendInBackground`, damit die UI-Response nicht auf Resend wartet)
// und der Stripe-Webhook beim Geschenk-Kauf „Auch am Computer schreiben".

export type SendInvitationInput = {
  /** Empfänger-Adresse (= eingeladene E-Mail) */
  to: string;
  inviterName: string;
  inviterEmail: string;
  projectName: string;
  role: "projektleiter" | "co_author";
  token: string;
  /** Einladung aus einem Geschenk-Kauf */
  isGift?: boolean;
};

function subjectFor(input: SendInvitationInput): string {
  if (input.isGift) {
    const inviter = input.inviterName.trim() || input.inviterEmail;
    return `${inviter} schenkt Ihnen ein Lebensbuch`;
  }
  return `Einladung zum Projekt „${input.projectName}“`;
}

/** Ein Versandversuch ohne Warteschlange — auch für das spätere Nachholen. */
export async function deliverInvitationMail(
  input: SendInvitationInput,
): Promise<SendMailResult> {
  return sendEmail({
    to: input.to,
    subject: subjectFor(input),
    react: InvitationEmail({
      inviterName: input.inviterName,
      inviterEmail: input.inviterEmail,
      projectName: input.projectName,
      role: input.role,
      token: input.token,
      siteUrl: getSiteUrl(),
      isGift: input.isGift,
    }),
    tags: [{ name: "type", value: input.isGift ? "gift_invitation" : "invitation" }],
  });
}

/**
 * Versendet die Einladungs-Mail an die eingeladene Adresse.
 *
 * Idempotenz: braucht KEINEN mail_log-Marker, weil pro Invitation-Row
 * höchstens einmal aufgerufen wird (die invitations.token-UNIQUE-Spalte
 * verhindert Doppel-Invitations). Scheitert der Versand, holt der tägliche
 * Cron die Mail nach (BUG-13). Einen manuell teilbaren Link gibt es bewusst
 * nicht (Entscheidung 2026-10-14).
 */
export async function sendInvitationMail(
  input: SendInvitationInput,
): Promise<void> {
  const result = await deliverInvitationMail(input);
  await recordMailResult({ kind: "invitation", input }, result);
}
