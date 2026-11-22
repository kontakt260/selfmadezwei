import "server-only";
import { sendEmail, getSiteUrl, type SendMailResult } from "./client";
import { recordMailResult } from "./retry-queue";
import { PortalPurchaseEmail } from "@/emails/PortalPurchaseEmail";

// PROJ-11 — Portal-Erstkauf-Bestätigung.
//
// Trigger: Stripe-Webhook nach erfolgreichem `initial_portal_access`-Payment.
// Geht an jeden Käufer — auch beim Geschenk ohne eigenen Zugang (dann in
// der Geschenk-Variante).
// Idempotenz läuft über den Stripe-Webhook selbst (UNIQUE stripe_session_id).

export type SendPortalPurchaseInput = {
  to: string;
  fullName?: string;
  amountFormatted: string;
  paymentDateFormatted: string;
  expiresAtFormatted: string;
  invoiceUrl?: string;
  /** Neu angelegtes Projekt — Ziel des Buttons „Zur Projektübersicht" */
  projectId?: string;
  /** Adresse der beschenkten Person, an die eine Einladung ging */
  giftRecipientEmail?: string;
  /** Name der beschenkten Person beim Geschenk „Nur per Sprachnachricht erzählen" */
  giftRecipientName?: string;
  /** false = Geschenk ohne eigenen Projektzugang des Käufers */
  buyerHasAccess?: boolean;
};

/** Ein Versandversuch ohne Warteschlange — auch für das spätere Nachholen. */
export async function deliverPortalPurchaseMail(
  input: SendPortalPurchaseInput,
): Promise<SendMailResult> {
  const buyerHasAccess = input.buyerHasAccess ?? true;

  return sendEmail({
    to: input.to,
    subject: buyerHasAccess
      ? "Ihr NARRAVIT-Projektzugang ist freigeschaltet"
      : "Ihr NARRAVIT-Geschenk ist unterwegs",
    react: PortalPurchaseEmail({
      fullName: input.fullName,
      amountFormatted: input.amountFormatted,
      paymentDateFormatted: input.paymentDateFormatted,
      expiresAtFormatted: input.expiresAtFormatted,
      invoiceUrl: input.invoiceUrl,
      siteUrl: getSiteUrl(),
      projectId: input.projectId,
      giftRecipientEmail: input.giftRecipientEmail,
      giftRecipientName: input.giftRecipientName,
      buyerHasAccess,
    }),
    tags: [{ name: "type", value: "portal_purchase" }],
  });
}

export async function sendPortalPurchaseMail(
  input: SendPortalPurchaseInput,
): Promise<void> {
  const result = await deliverPortalPurchaseMail(input);
  await recordMailResult({ kind: "portal_purchase", input }, result);
}
