import "server-only";
import { sendEmail, getSiteUrl, hashEmailForLog } from "./client";
import { RenewalEmail } from "@/emails/RenewalEmail";

// PROJ-11 — Verlängerungs-Bestätigung.
//
// Trigger: Stripe-Webhook nach erfolgreichem `portal_access_renewal`-Payment.

export type SendRenewalInput = {
  to: string;
  fullName?: string;
  amountFormatted: string;
  paymentDateFormatted: string;
  newExpiresAtFormatted: string;
  invoiceUrl?: string;
};

export async function sendRenewalMail(input: SendRenewalInput): Promise<void> {
  const siteUrl = getSiteUrl();

  const result = await sendEmail({
    to: input.to,
    subject: "Ihr narravit-Portal-Zugang wurde verlängert",
    react: RenewalEmail({
      fullName: input.fullName,
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
