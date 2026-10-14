import "server-only";
import { sendEmail, getSiteUrl, hashEmailForLog } from "./client";
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
  return `Einladung zum Projekt „${input.projectName}"`;
}

/**
 * Versendet die Einladungs-Mail an die eingeladene Adresse.
 *
 * Idempotenz: braucht KEINEN mail_log-Marker, weil pro Invitation-Row
 * höchstens einmal aufgerufen wird (die invitations.token-UNIQUE-Spalte
 * verhindert Doppel-Invitations). Bei Resend-Fehler erfolgt KEIN
 * automatischer Retry — der UI-Step-2-Modal zeigt dem PL den Link, damit
 * er ihn notfalls manuell teilt.
 */
export async function sendInvitationMail(
  input: SendInvitationInput,
): Promise<void> {
  const siteUrl = getSiteUrl();

  const result = await sendEmail({
    to: input.to,
    subject: subjectFor(input),
    react: InvitationEmail({
      inviterName: input.inviterName,
      inviterEmail: input.inviterEmail,
      projectName: input.projectName,
      role: input.role,
      token: input.token,
      siteUrl,
      isGift: input.isGift,
    }),
    tags: [{ name: "type", value: input.isGift ? "gift_invitation" : "invitation" }],
  });

  if (!result.ok) {
    // Best-Effort: nur Server-Log, kein User-Feedback.
    console.error(
      `[email/invitation] send failed for ${hashEmailForLog(input.to)}: ${result.error}`,
    );
  }
}
