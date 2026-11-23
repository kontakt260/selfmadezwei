import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, type ProductType } from "@/lib/stripe/server";
import { isCheckoutPaid } from "@/lib/stripe/payment-status";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { markNarrationDraft } from "@/lib/purchases/narration-draft";
import {
  isDirectGiftSession,
  isGuestSession,
  recordGuestPurchase,
} from "@/lib/purchases/guest-purchase";
import { generateClaimToken, hashClaimToken } from "@/lib/purchases/claim-token";
import { handleInitial, handleDirectGift, sendGuestConfirmation, handleRenewal } from "./handlers";

// Stripe-Webhook-Route (PROJ-6 Backend).
//
// Edge-Runtime ist hier ungeeignet: Stripe-Signaturen verlangen
// byte-genauen Raw-Body. Wir erzwingen Node-Runtime und lesen den Body
// als String (NICHT als JSON).
export const runtime = "nodejs";

// Force-dynamic: kein Caching, Webhook-Calls sollen jederzeit
// ausgeführt werden.
export const dynamic = "force-dynamic";

// 3-Linien-Verteidigung (siehe Tech-Design Sektion C):
//   1. Signatur-Verifikation (Stripe-Secret).
//   2. Idempotenz-Check (payments.stripe_session_id UNIQUE).
//   3. Service-Role-Write.

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig) return new NextResponse("Missing signature header", { status: 400 });
  if (!secret) return new NextResponse("Webhook secret not configured", { status: 500 });

  // Raw-Body lesen (NICHT req.json — Stripe signiert das Original).
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Invalid signature: ${msg}`, { status: 400 });
  }

  // Abgeschlossener Checkout, bei verzögerten Zahlarten (z. B. SEPA) zusätzlich
  // der spätere Zahlungseingang. Andere Events 200 quittieren, damit Stripe
  // nicht retried.
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object;
  if (!isCheckoutPaid(session)) {
    // Geld noch nicht da: Die Erfüllung folgt mit async_payment_succeeded.
    // PROJ-24: Bis dahin müssen die Kontaktdaten länger erhalten bleiben.
    if (session.metadata?.narration_draft) {
      await markNarrationDraft(
        createServiceRoleClient(),
        session.metadata.narration_draft,
        "payment_pending",
      );
    }
    return NextResponse.json({ received: true, ignored: session.payment_status });
  }

  const supabase = createServiceRoleClient();

  // Idempotenz-Check: existiert bereits ein payments-Eintrag mit dieser
  // stripe_session_id? Wenn ja, 200 OK ohne weitere Aktion.
  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const meta = session.metadata ?? {};
  const productType = meta.product_type as ProductType | "vapi" | undefined;
  const userId = meta.user_id as string | undefined;

  // Geschenk ohne eigenen Zugang, ohne Konto gekauft: Projekt und Einladung
  // entstehen sofort, der Käufer muss nichts weiter tun.
  if (isDirectGiftSession(session)) {
    try {
      await handleDirectGift(supabase, session, meta);
    } catch (err) {
      // DB-Fehler → 500, Stripe wiederholt. Die Erfüllung räumt halbe
      // Projekte selbst wieder ab.
      const msg = err instanceof Error ? err.message : String(err);
      return new NextResponse(`Internal error: ${msg}`, { status: 500 });
    }
    return NextResponse.json({ received: true, processed: "direct_gift" });
  }

  // Kauf ohne Konto (2026-11-16): Die Zahlung ist da, aber es gibt noch
  // niemanden, dem das Projekt gehören könnte. Wir halten den Kauf als
  // offenen Anspruch fest und bitten per Mail, das Konto anzulegen. Das
  // Projekt entsteht beim Einlösen (/kauf-einloesen).
  if (isGuestSession(session)) {
    // Persönlicher Link für die Mail: In der Datenbank liegt nur der Hash.
    const mailToken = generateClaimToken();
    try {
      const recorded = await recordGuestPurchase(supabase, session, hashClaimToken(mailToken));
      if (recorded === "invalid") {
        return NextResponse.json(
          { received: true, error: "invalid_guest_metadata" },
          { status: 200 },
        );
      }
      if (recorded === "duplicate") {
        return NextResponse.json({ received: true, duplicate: true });
      }
    } catch (err) {
      // DB-Fehler → 500, Stripe wiederholt den Aufruf.
      const msg = err instanceof Error ? err.message : String(err);
      return new NextResponse(`Internal error: ${msg}`, { status: 500 });
    }
    await sendGuestConfirmation(session, meta, mailToken);
    return NextResponse.json({ received: true, processed: "guest_initial" });
  }

  if (!productType || !userId) {
    // Metadata fehlt — kein State-Update möglich. Wir loggen aber
    // antworten 200, sonst retried Stripe ewig.
    return NextResponse.json(
      { received: true, error: "missing_metadata", productType, userId },
      { status: 200 },
    );
  }

  try {
    if (productType === "initial") {
      await handleInitial(supabase, session, meta, userId);
    } else if (productType === "renewal") {
      await handleRenewal(supabase, session, meta, userId);
    } else if (productType === "vapi") {
      // Das Vapi-Top-Up ist seit 2026-10-13 kein kaufbares Produkt mehr
      // (PROJ-6-Rückbau). Altereignisse quittieren wir ohne State-Update,
      // damit Stripe nicht endlos retried.
      console.warn(
        `[stripe-webhook] retired product "vapi" ignored (session ${session.id})`,
      );
      return NextResponse.json(
        { received: true, ignored: "retired_product", productType },
        { status: 200 },
      );
    } else {
      return NextResponse.json(
        { received: true, error: "unknown_product_type", productType },
        { status: 200 },
      );
    }
  } catch (err) {
    // Bei DB-Fehler: 500 zurückgeben, Stripe retried. Idempotenz-Check
    // oben verhindert Duplikate beim Retry.
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Internal error: ${msg}`, { status: 500 });
  }

  return NextResponse.json({ received: true, processed: productType });
}
