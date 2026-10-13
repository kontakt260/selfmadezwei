import "server-only";
import { sendEmail, getSiteUrl, hashEmailForLog } from "./client";
import { ReminderEmail, type ReminderVariant } from "@/emails/ReminderEmail";
import {
  reserveMailLog,
  finalizeMailLog,
  type MailType,
} from "./idempotency";

// PROJ-11 — Ablauf-Reminder (30 / 7 Tage).
//
// Trigger: tägliche Vercel-Cron-Route /api/cron/reminders.
//
// Idempotenz: pro (user_id, project_id, mail_type) genau einmal —
// UNIQUE-Constraint in mail_log. Bei Konflikt wird der Versand
// übersprungen.

export type SendReminderInput = {
  to: string;
  userId: string;
  projectId: string;
  variant: ReminderVariant;
  fullName?: string;
  projectName: string;
  expiresAtFormatted: string;
  renewUrl: string;
};

function mailTypeFor(variant: ReminderVariant): MailType {
  return variant === "30" ? "reminder_30" : "reminder_7";
}

function subjectFor(variant: ReminderVariant, projectName: string): string {
  if (variant === "30") {
    return `Erinnerung: Ihr Portal-Zugang für „${projectName}" läuft in 30 Tagen ab`;
  }
  return `Nur noch 7 Tage Portal-Zugang für „${projectName}"`;
}

export async function maybeSendReminderMail(
  input: SendReminderInput,
): Promise<{ sent: boolean; skipped?: "duplicate" | "db_error" | "send_failed" }> {
  const mailType = mailTypeFor(input.variant);

  const reserve = await reserveMailLog({
    userId: input.userId,
    projectId: input.projectId,
    mailType,
  });

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
    subject: subjectFor(input.variant, input.projectName),
    react: ReminderEmail({
      fullName: input.fullName,
      projectName: input.projectName,
      expiresAtFormatted: input.expiresAtFormatted,
      variant: input.variant,
      renewUrl: input.renewUrl,
      siteUrl,
    }),
    tags: [
      { name: "type", value: mailType },
      { name: "variant", value: input.variant },
    ],
  });

  await finalizeMailLog(
    reserve.logId,
    result.ok
      ? { ok: true, resendMessageId: result.messageId }
      : { ok: false, error: result.error },
  );

  if (!result.ok) {
    console.error(
      `[email/reminder/${input.variant}] send failed for ${hashEmailForLog(input.to)}: ${result.error}`,
    );
    return { sent: false, skipped: "send_failed" };
  }

  return { sent: true };
}
