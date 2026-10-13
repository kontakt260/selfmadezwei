import "server-only";
import { sendEmail, getSiteUrl, hashEmailForLog } from "./client";
import { PortalPurchaseEmail } from "@/emails/PortalPurchaseEmail";

// PROJ-11 — Portal-Erstkauf-Bestätigung.
//
// Trigger: Stripe-Webhook nach erfolgreichem `initial_portal_access`-Payment.
// Idempotenz läuft über den Stripe-Webhook selbst (UNIQUE stripe_session_id).

export type SendPortalPurchaseInput = {
  to: string;
  fullName?: string;
  amountFormatted: string;
  paymentDateFormatted: string;
  expiresAtFormatted: string;
  invoiceUrl?: string;
};

export async function sendPortalPurchaseMail(
  input: SendPortalPurchaseInput,
): Promise<void> {
  const siteUrl = getSiteUrl();

  const result = await sendEmail({
    to: input.to,
    subject: "Ihr narravit-Portal-Zugang ist freigeschaltet",
    react: PortalPurchaseEmail({
      fullName: input.fullName,
      amountFormatted: input.amountFormatted,
      paymentDateFormatted: input.paymentDateFormatted,
      expiresAtFormatted: input.expiresAtFormatted,
      invoiceUrl: input.invoiceUrl,
      siteUrl,
    }),
    tags: [{ name: "type", value: "portal_purchase" }],
  });

  if (!result.ok) {
    console.error(
      `[email/portal-purchase] send failed for ${hashEmailForLog(input.to)}: ${result.error}`,
    );
  }
}
