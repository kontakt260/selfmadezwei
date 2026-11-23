import "server-only";
import { RetentionBrakeAlertEmail } from "@/emails/RetentionBrakeAlertEmail";
import { sendEmail } from "./client";
import { MAIL_ALERT_RECIPIENT } from "./retry-mails";

// PROJ-28 — meldet dem Support, dass die Sicherheitsbremse gegriffen hat.
// Wirft nie: Der tägliche Lauf muss danach normal weitergehen.

export async function sendRetentionBrakeAlert(input: {
  due: number;
  limit: number;
}): Promise<void> {
  try {
    const result = await sendEmail({
      to: MAIL_ALERT_RECIPIENT,
      subject: "NARRAVIT: Automatischer Löschlauf angehalten",
      react: RetentionBrakeAlertEmail(input),
      tags: [{ name: "type", value: "retention_brake_alert" }],
    });
    if (!result.ok) {
      console.error(`[email/retention-brake-alert] failed: ${result.error}`);
    }
  } catch (err) {
    console.error(
      `[email/retention-brake-alert] failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
