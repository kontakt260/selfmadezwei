import "server-only";
import { sendEmail, getSiteUrl, type SendMailResult } from "./client";
import { recordMailResult } from "./retry-queue";
import { GuestPurchaseEmail } from "@/emails/GuestPurchaseEmail";

// PROJ-6/PROJ-11 — Kauf-Bestätigung für Käufe ohne Konto.
//
// Trigger: Stripe-Webhook nach einem bezahlten Erstkauf, bei dem der
// Käufer nicht angemeldet war. Die Mail führt zum Anlegen des Kontos.
// Idempotenz läuft über den Webhook (UNIQUE purchase_claims.stripe_session_id).

export type SendGuestPurchaseInput = {
  /** Adresse aus dem Stripe-Checkout */
  to: string;
  /** Zuordnung zum Kauf, damit ein Nachholen einen neuen Link erzeugen kann */
  stripeSessionId: string;
  fullName?: string;
  amountFormatted: string;
  paymentDateFormatted: string;
  isGift?: boolean;
  invoiceUrl?: string;
  /** Geheimnis für den persönlichen Einlöse-Link in der Mail */
  claimCode?: string;
};

/** Ein Versandversuch ohne Warteschlange — auch für das spätere Nachholen. */
export async function deliverGuestPurchaseMail(
  input: SendGuestPurchaseInput,
): Promise<SendMailResult> {
  return sendEmail({
    to: input.to,
    subject: "Ihre Zahlung ist eingegangen — bitte legen Sie Ihr NARRAVIT-Konto an",
    react: GuestPurchaseEmail({
      fullName: input.fullName,
      buyerEmail: input.to,
      amountFormatted: input.amountFormatted,
      paymentDateFormatted: input.paymentDateFormatted,
      isGift: input.isGift,
      invoiceUrl: input.invoiceUrl,
      claimCode: input.claimCode,
      siteUrl: getSiteUrl(),
    }),
    tags: [{ name: "type", value: "guest_purchase" }],
  });
}

export async function sendGuestPurchaseMail(input: SendGuestPurchaseInput): Promise<void> {
  const result = await deliverGuestPurchaseMail(input);
  // Das Geheimnis liegt nirgends im Klartext: Das Nachholen erzeugt ein neues.
  await recordMailResult(
    { kind: "guest_purchase", input: { ...input, claimCode: undefined } },
    result,
  );
}
