import "server-only";
import { sendEmail, getSiteUrl, hashEmailForLog } from "./client";
import { WelcomeEmail } from "@/emails/WelcomeEmail";
import {
  reserveMailLog,
  finalizeMailLog,
} from "./idempotency";

// PROJ-11 — Welcome-Mail nach Account-Verifikation.
//
// Trigger: /auth/callback nach erfolgreichem exchangeCodeForSession.
//
// Idempotenz: pro user_id genau einmal — UNIQUE NULLS NOT DISTINCT auf
// (user_id, NULL, "welcome") in mail_log. Bei Konflikt (User klickt
// Verify-Link mehrfach) wird der Versand schlicht übersprungen.

export type SendWelcomeInput = {
  to: string;
  userId: string;
  fullName?: string;
};

export async function maybeSendWelcomeMail(
  input: SendWelcomeInput,
): Promise<void> {
  // Idempotenz: reserveMailLog versucht den Marker-Insert. Bei Duplicate
  // (User wurde schon mal begrüßt) wird komplett übersprungen.
  const reserve = await reserveMailLog({
    userId: input.userId,
    projectId: null,
    mailType: "welcome",
  });

  if (!reserve.reserved) {
    // Entweder duplicate (häufig & erwartet) oder db_error.
    // Bei db_error nichts tun — Best-Effort. Wir wollen nicht das
    // /auth/callback blockieren.
    if (reserve.reason === "db_error") {
      console.error(
        `[email/welcome] mail_log reserve failed for user ${input.userId}: ${reserve.error}`,
      );
    }
    return;
  }

  const siteUrl = getSiteUrl();
  const result = await sendEmail({
    to: input.to,
    subject: "Willkommen bei narravit",
    react: WelcomeEmail({
      fullName: input.fullName,
      siteUrl,
    }),
    tags: [{ name: "type", value: "welcome" }],
  });

  // Marker mit Resend-Result aktualisieren — bleibt auch bei Fehler stehen,
  // damit wir nicht endlos retryen.
  await finalizeMailLog(
    reserve.logId,
    result.ok
      ? { ok: true, resendMessageId: result.messageId }
      : { ok: false, error: result.error },
  );

  if (!result.ok) {
    console.error(
      `[email/welcome] send failed for ${hashEmailForLog(input.to)}: ${result.error}`,
    );
  }
}
