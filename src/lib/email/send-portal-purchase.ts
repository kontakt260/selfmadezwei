import "server-only";
import { sendEmail, getSiteUrl, hashEmailForLog } from "./client";
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
  /** Adresse der beschenkten Person, an die eine Einladung ging */
  giftRecipientEmail?: string;
  /** false = Geschenk ohne eigenen Portal-Zugang des Käufers */
  buyerHasAccess?: boolean;
};

export async function sendPortalPurchaseMail(
  input: SendPortalPurchaseInput,
): Promise<void> {
  const siteUrl = getSiteUrl();
  const buyerHasAccess = input.buyerHasAccess ?? true;

  const result = await sendEmail({
    to: input.to,
    subject: buyerHasAccess
      ? "Ihr narravit-Portal-Zugang ist freigeschaltet"
      : "Ihr narravit-Geschenk ist unterwegs",
    react: PortalPurchaseEmail({
      fullName: input.fullName,
      amountFormatted: input.amountFormatted,
      paymentDateFormatted: input.paymentDateFormatted,
      expiresAtFormatted: input.expiresAtFormatted,
      invoiceUrl: input.invoiceUrl,
      siteUrl,
      giftRecipientEmail: input.giftRecipientEmail,
      buyerHasAccess,
    }),
    tags: [{ name: "type", value: "portal_purchase" }],
  });

  if (!result.ok) {
    console.error(
      `[email/portal-purchase] send failed for ${hashEmailForLog(input.to)}: ${result.error}`,
    );
  }
}
