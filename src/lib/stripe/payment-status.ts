import type Stripe from "stripe";

// Wann gilt eine Checkout-Session als bezahlt? (PROJ-6, QA 2026-11-21)
//
//   - `paid`: normale Zahlung ist eingegangen.
//   - `no_payment_required` mit Betrag 0: Rabattcode über 100 %. Der Betrag
//     wird mitgeprüft, weil Stripe denselben Status auch für Zahlungen
//     verwendet, die erst später fällig werden.
//   - `unpaid`: verzögerte Zahlart (z. B. SEPA-Lastschrift), das Geld ist
//     noch nicht da. Die Erfüllung folgt mit dem Webhook-Event
//     `checkout.session.async_payment_succeeded`.

type PaymentFields = Pick<Stripe.Checkout.Session, "payment_status" | "amount_total">;

export function isCheckoutPaid(session: PaymentFields): boolean {
  if (session.payment_status === "paid") return true;
  return session.payment_status === "no_payment_required" && session.amount_total === 0;
}
