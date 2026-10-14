import "server-only";
import { sendEmail, getSiteUrl, hashEmailForLog } from "./client";
import { ReminderEmail, type ReminderVariant } from "@/emails/ReminderEmail";
import {
  reserveMailLog,
  finalizeMailLog,
  releaseMailLog,
  deleteStaleMailLog,
  type MailType,
} from "./idempotency";

// PROJ-11 — Ablauf-Reminder (30 / 7 Tage).
//
// Trigger: tägliche Vercel-Cron-Route /api/cron/reminders.
//
// Idempotenz: pro (user_id, project_id, mail_type) ein Marker in mail_log.
// Der Marker gilt nur für das aktuelle Ablaufdatum: Ein Marker, der lange
// vor dem Ablauf gesetzt wurde, stammt aus einem früheren Laufzeit-Zyklus
// (vor einer Verlängerung) und wird ersetzt. Schlägt der Versand fehl, wird
// der Marker freigegeben — der nächste Cron-Lauf versucht es erneut.

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ein Reminder-Marker, der früher als 60 Tage vor dem aktuellen Ablauf
 * gesetzt wurde, gehört zu einem früheren Ablaufdatum. Reminder gehen
 * frühestens 30 Tage vorher raus, eine Verlängerung verschiebt den Ablauf
 * um 12 Monate — beide Fälle sind damit sicher getrennt.
 */
const STALE_MARKER_DAYS = 60;

export type SendReminderInput = {
  to: string;
  userId: string;
  projectId: string;
  variant: ReminderVariant;
  fullName?: string;
  projectName: string;
  /** Ablaufzeitpunkt als ISO-String (für die Zuordnung des Markers) */
  expiresAt: string;
  expiresAtFormatted: string;
  /** Verbleibende Tage bis zum Ablauf (≥ 1) */
  daysLeft: number;
  renewUrl: string;
};

function mailTypeFor(variant: ReminderVariant): MailType {
  return variant === "30" ? "reminder_30" : "reminder_7";
}

function subjectFor(daysLeft: number, variant: ReminderVariant, projectName: string): string {
  if (variant === "30") {
    return `Erinnerung: Ihr Portal-Zugang für „${projectName}" läuft in ${daysLeft} Tagen ab`;
  }
  const days = daysLeft === 1 ? "1 Tag" : `${daysLeft} Tage`;
  return `Nur noch ${days} Portal-Zugang für „${projectName}"`;
}

export async function maybeSendReminderMail(
  input: SendReminderInput,
): Promise<{ sent: boolean; skipped?: "duplicate" | "db_error" | "send_failed" }> {
  const mailType = mailTypeFor(input.variant);
  const markerKey = {
    userId: input.userId,
    projectId: input.projectId,
    mailType,
  };

  let reserve = await reserveMailLog(markerKey);

  if (!reserve.reserved && reserve.reason === "duplicate") {
    const sentBefore = new Date(
      new Date(input.expiresAt).getTime() - STALE_MARKER_DAYS * ONE_DAY_MS,
    );
    const removed = await deleteStaleMailLog({ ...markerKey, sentBefore });
    if (removed) reserve = await reserveMailLog(markerKey);
  }

  if (!reserve.reserved) {
    if (reserve.reason === "db_error") {
      console.error(
        `[email/reminder] mail_log reserve failed for user ${input.userId} project ${input.projectId}: ${reserve.error}`,
      );
    }
    return { sent: false, skipped: reserve.reason };
  }

  const siteUrl = getSiteUrl();
  const result = await sendEmail({
    to: input.to,
    subject: subjectFor(input.daysLeft, input.variant, input.projectName),
    react: ReminderEmail({
      fullName: input.fullName,
      projectName: input.projectName,
      expiresAtFormatted: input.expiresAtFormatted,
      daysLeft: input.daysLeft,
      variant: input.variant,
      renewUrl: input.renewUrl,
      siteUrl,
    }),
    tags: [
      { name: "type", value: mailType },
      { name: "variant", value: input.variant },
    ],
  });

  if (!result.ok) {
    await releaseMailLog(reserve.logId);
    console.error(
      `[email/reminder/${input.variant}] send failed for ${hashEmailForLog(input.to)}: ${result.error}`,
    );
    return { sent: false, skipped: "send_failed" };
  }

  await finalizeMailLog(reserve.logId, {
    ok: true,
    resendMessageId: result.messageId,
  });
  return { sent: true };
}
