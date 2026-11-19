import "server-only";
import { sendEmail, getSiteUrl, hashEmailForLog } from "./client";
import { GuestPurchaseEmail } from "@/emails/GuestPurchaseEmail";

// PROJ-6/PROJ-11 — Kauf-Bestätigung für Käufe ohne Konto.
//
// Trigger: Stripe-Webhook nach einem bezahlten Erstkauf, bei dem der
// Käufer nicht angemeldet war. Die Mail führt zum Anlegen des Kontos.
// Idempotenz läuft über den Webhook (UNIQUE purchase_claims.stripe_session_id).

export type SendGuestPurchaseInput = {
  /** Adresse aus dem Stripe-Checkout */
  to: string;
  fullName?: string;
  amountFormatted: string;
  paymentDateFormatted: string;
  isGift?: boolean;
  invoiceUrl?: string;
};

export async function sendGuestPurchaseMail(input: SendGuestPurchaseInput): Promise<void> {
  const result = await sendEmail({
    to: input.to,
    subject: "Ihre Zahlung ist eingegangen — bitte legen Sie Ihr NARRAVIT-Konto an",
    react: GuestPurchaseEmail({
      fullName: input.fullName,
      buyerEmail: input.to,
      amountFormatted: input.amountFormatted,
      paymentDateFormatted: input.paymentDateFormatted,
      isGift: input.isGift,
      invoiceUrl: input.invoiceUrl,
      siteUrl: getSiteUrl(),
    }),
    tags: [{ name: "type", value: "guest_purchase" }],
  });

  if (!result.ok) {
    console.error(
      `[email/guest-purchase] send failed for ${hashEmailForLog(input.to)}: ${result.error}`,
    );
  }
}
