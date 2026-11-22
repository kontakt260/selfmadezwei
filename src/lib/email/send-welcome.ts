import "server-only";
import { sendEmail, getSiteUrl, hashEmailForLog } from "./client";
import { WelcomeEmail } from "@/emails/WelcomeEmail";
import {
  reserveMailLog,
  finalizeMailLog,
  releaseMailLog,
  deleteAbandonedMailLog,
} from "./idempotency";
import { resolveWelcomeDiscountCode, WELCOME_DISCOUNT_LABEL } from "./welcome-discount";

// PROJ-11 — Welcome-Mail nach Account-Verifikation.
//
// Trigger: /auth/callback nach erfolgreichem Login über einen Mail-Link
// oder OAuth, nur für neue Konten (siehe isRecentSignup).
//
// Idempotenz: pro user_id genau einmal — UNIQUE NULLS NOT DISTINCT auf
// (user_id, NULL, "welcome") in mail_log. Bei Konflikt (User klickt
// Verify-Link mehrfach) wird der Versand schlicht übersprungen. Schlägt
// der Versand fehl, wird der Marker wieder freigegeben, damit der nächste
// Callback es erneut versucht.

/** Bis zu diesem Kontoalter gilt ein Login noch als „gerade registriert". */
const WELCOME_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Bestandskonten sollen beim nächsten Passwort-Reset oder Google-Login
 * kein „Willkommen bei narravit" bekommen — nur Konten, die in den letzten
 * 14 Tagen angelegt wurden.
 */
export function isRecentSignup(
  createdAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return now - created <= WELCOME_WINDOW_MS;
}

export type SendWelcomeInput = {
  to: string;
  userId: string;
  fullName?: string;
  /** Normale Registrierung, nicht über einen Kauf oder eine Einladung. */
  offerDiscount?: boolean;
};

export async function maybeSendWelcomeMail(
  input: SendWelcomeInput,
): Promise<void> {
  // Idempotenz: reserveMailLog versucht den Marker-Insert. Bei Duplicate
  // (User wurde schon mal begrüßt) wird komplett übersprungen.
  const markerKey = {
    userId: input.userId,
    projectId: null,
    mailType: "welcome" as const,
  };
  let reserve = await reserveMailLog(markerKey);

  // Ein Versand, der nie zu Ende kam, darf die Mail nicht dauerhaft sperren.
  if (
    !reserve.reserved &&
    reserve.reason === "duplicate" &&
    (await deleteAbandonedMailLog(markerKey))
  ) {
    reserve = await reserveMailLog(markerKey);
  }

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

  const discountCode = input.offerDiscount
    ? await resolveWelcomeDiscountCode({ userId: input.userId, email: input.to })
    : undefined;

  const siteUrl = getSiteUrl();
  const result = await sendEmail({
    to: input.to,
    subject: "Willkommen bei NARRAVIT",
    react: WelcomeEmail({
      fullName: input.fullName,
      siteUrl,
      discount: discountCode
        ? { code: discountCode, amountLabel: WELCOME_DISCOUNT_LABEL }
        : undefined,
    }),
    tags: [{ name: "type", value: "welcome" }],
  });

  if (!result.ok) {
    await releaseMailLog(reserve.logId);
    console.error(
      `[email/welcome] send failed for ${hashEmailForLog(input.to)}: ${result.error}`,
    );
    return;
  }

  await finalizeMailLog(reserve.logId, {
    ok: true,
    resendMessageId: result.messageId,
  });
}
