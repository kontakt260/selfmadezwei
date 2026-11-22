import "server-only";
import { DeletedProjectPaymentAlertEmail } from "@/emails/DeletedProjectPaymentAlertEmail";
import { sendEmail } from "./client";
import { MAIL_ALERT_RECIPIENT } from "./retry-mails";

// PROJ-26 — meldet dem Support eine Zahlung für ein gelöschtes Projekt.
// Wirft nie: Die Zahlung ist da schon gebucht und darf nicht zurückrollen.

export async function sendDeletedProjectPaymentAlert(input: {
  projectId: string;
  stripeSessionId: string;
  finallyDeleted?: boolean;
}): Promise<void> {
  try {
    const result = await sendEmail({
      to: MAIL_ALERT_RECIPIENT,
      subject: "NARRAVIT: Zahlung für ein gelöschtes Projekt",
      react: DeletedProjectPaymentAlertEmail(input),
      tags: [{ name: "type", value: "deleted_project_payment_alert" }],
    });
    if (!result.ok) {
      console.error(`[email/deleted-project-alert] failed: ${result.error}`);
    }
  } catch (err) {
    console.error(
      `[email/deleted-project-alert] failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
