import "server-only";
import { sendEmail, getSiteUrl, hashEmailForLog } from "./client";
import { RenewalEmail } from "@/emails/RenewalEmail";

// PROJ-11 — Verlängerung des Projektzugangs.
//
// Trigger: Stripe-Webhook nach erfolgreichem `portal_access_renewal`-Payment.
// Die Person, die bezahlt hat, bekommt die Bestätigung; alle anderen
// Projektmitglieder eine Info, wer verlängert hat (Jakob, 2026-11-19).

export type SendRenewalInput = {
  to: string;
  fullName?: string;
  /** Projekttitel — erste Zeile der Detail-Box */
  projectName: string;
  /** Ziel des Buttons „Zur Projektübersicht" */
  projectId?: string;
  amountFormatted: string;
  paymentDateFormatted: string;
  newExpiresAtFormatted: string;
  invoiceUrl?: string;
};

export async function sendRenewalMail(input: SendRenewalInput): Promise<void> {
  const siteUrl = getSiteUrl();

  const result = await sendEmail({
    to: input.to,
    subject: "Ihr NARRAVIT-Projektzugang wurde verlängert",
    react: RenewalEmail({
      fullName: input.fullName,
      projectName: input.projectName,
      projectId: input.projectId,
      amountFormatted: input.amountFormatted,
      paymentDateFormatted: input.paymentDateFormatted,
      newExpiresAtFormatted: input.newExpiresAtFormatted,
      invoiceUrl: input.invoiceUrl,
      siteUrl,
    }),
    tags: [{ name: "type", value: "renewal" }],
  });

  if (!result.ok) {
    console.error(
      `[email/renewal] send failed for ${hashEmailForLog(input.to)}: ${result.error}`,
    );
  }
}

export type SendRenewalInfoInput = {
  to: string;
  fullName?: string;
  /** Name der Person, die verlängert hat */
  renewedBy: string;
  projectName: string;
  /** Ziel des Buttons „Zur Projektübersicht" */
  projectId?: string;
  newExpiresAtFormatted: string;
};

/** Info an ein Projektmitglied, das nicht selbst verlängert hat. */
export async function sendRenewalInfoMail(input: SendRenewalInfoInput): Promise<void> {
  const siteUrl = getSiteUrl();

  const result = await sendEmail({
    to: input.to,
    subject: `Der Projektzugang für „${input.projectName}“ wurde verlängert`,
    react: RenewalEmail({
      fullName: input.fullName,
      renewedBy: input.renewedBy,
      projectName: input.projectName,
      projectId: input.projectId,
      newExpiresAtFormatted: input.newExpiresAtFormatted,
      siteUrl,
    }),
    tags: [{ name: "type", value: "renewal_info" }],
  });

  if (!result.ok) {
    console.error(
      `[email/renewal-info] send failed for ${hashEmailForLog(input.to)}: ${result.error}`,
    );
  }
}
