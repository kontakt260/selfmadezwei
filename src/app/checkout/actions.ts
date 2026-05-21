"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStripe, getPriceId, getSiteUrl } from "@/lib/stripe/server";

// Stripe-Checkout-Initiator (PROJ-6 Backend).
//
// Dieselbe Action wie in der Frontend-Phase, aber: erstellt jetzt eine
// echte Stripe-Checkout-Session und liefert die `session.url` zurück
// (Client redirected dorthin). Auth + Eingabe-Validierung unverändert
// gegenüber Frontend-Phase.
//
// Wichtig:
//   - Diese Action läuft serverseitig — der Stripe-Secret-Key bleibt im
//     Server-Process.
//   - Wir verwenden `redirect()` aus next/navigation NICHT direkt, weil
//     sie Server-Actions als Throw-Exception verlässt und der Client
//     dann doch noch eine Antwort braucht. Stattdessen geben wir die
//     `url` zurück und der Client navigiert via `window.location`.

export type CheckoutProductType = "initial" | "renewal" | "vapi";

export type InitialMetadata = {
  fullName: string;
  isGift: boolean;
  giftRecipientName?: string;
  giftRecipientEmail?: string;
  giftMode?: "phone-only" | "phone-plus-computer";
  giftRecipientRole?: "projektleiter" | "co_author";
  buyerRetainsAccess?: boolean;
};

export type StartCheckoutInput =
  | { productType: "initial"; metadata: InitialMetadata }
  | { productType: "renewal"; projectId: string }
  | { productType: "vapi"; projectId: string };

export type StartCheckoutResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; error: string };

export async function startCheckoutAction(
  input: StartCheckoutInput,
): Promise<StartCheckoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  // Eingabe-Validierung pro Produkt-Typ.
  if (input.productType === "initial") {
    if (!input.metadata.fullName?.trim()) {
      return { ok: false, error: "Name fehlt." };
    }
    if (input.metadata.isGift) {
      if (!input.metadata.giftRecipientName?.trim()) {
        return { ok: false, error: "Name der beschenkten Person fehlt." };
      }
      if (input.metadata.giftMode === "phone-plus-computer") {
        if (!input.metadata.giftRecipientEmail?.trim()) {
          return { ok: false, error: "E-Mail der beschenkten Person fehlt." };
        }
      }
    }
  } else {
    if (!input.projectId?.trim()) {
      return { ok: false, error: "Projekt-ID fehlt." };
    }
    // Mitgliedschaft prüfen — nur Projektleiter dürfen verlängern/nachkaufen.
    const { data: membership } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", input.projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership || membership.role !== "projektleiter") {
      return { ok: false, error: "Keine Berechtigung für dieses Projekt." };
    }
  }

  // Stripe-Checkout-Session erstellen.
  let stripe;
  let priceId: string;
  let siteUrl: string;
  try {
    stripe = getStripe();
    priceId = getPriceId(input.productType);
    siteUrl = getSiteUrl();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe nicht konfiguriert.";
    return { ok: false, error: msg };
  }

  // success_url + cancel_url:
  // success → /kauf-erfolgreich mit session_id (verifiziert server-seitig)
  // cancel  → /onboarding (initial) bzw. /projektuebersicht/[pid] (renewal/vapi)
  const successUrl = `${siteUrl}/kauf-erfolgreich?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl =
    input.productType === "initial"
      ? `${siteUrl}/onboarding?checkout=cancelled`
      : `${siteUrl}/projektuebersicht/${input.projectId}?checkout=cancelled`;

  // Metadata-Aufbau für den Webhook.
  // String-Werte zwingend: Stripe-Metadata akzeptiert nur strings.
  const metadata: Record<string, string> = {
    user_id: user.id,
    product_type: input.productType,
  };
  if (input.productType === "initial") {
    metadata.full_name = input.metadata.fullName;
    metadata.is_gift = input.metadata.isGift ? "1" : "0";
    if (input.metadata.isGift) {
      metadata.gift_recipient_name = input.metadata.giftRecipientName ?? "";
      metadata.gift_recipient_email = input.metadata.giftRecipientEmail ?? "";
      metadata.gift_mode = input.metadata.giftMode ?? "phone-only";
      metadata.gift_recipient_role = input.metadata.giftRecipientRole ?? "co_author";
      metadata.buyer_retains_access = input.metadata.buyerRetainsAccess ? "1" : "0";
    }
  } else {
    metadata.project_id = input.projectId;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Buyer-Email vorbelegen für UX (Stripe akzeptiert auch ohne, aber
      // dann muss der User sie erneut eintippen).
      customer_email: user.email ?? undefined,
      allow_promotion_codes: true,
      // Metadata wird vom Webhook gelesen, um die richtige DB-Aktion
      // auszuführen (Projekt anlegen / Renewal / Vapi-Top-Up).
      metadata,
      // payment_intent_data.metadata zusätzlich befüllen — manche
      // Stripe-Reports zeigen nur die PaymentIntent-Metadata.
      payment_intent_data: { metadata },
    });
    if (!session.url) {
      return { ok: false, error: "Stripe lieferte keine Checkout-URL." };
    }
    return { ok: true, checkoutUrl: session.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Checkout konnte nicht gestartet werden.";
    return { ok: false, error: msg };
  }
}

// Optionaler Helper: ruft die Action auf und macht direkt den Redirect.
// Wird von einigen Server-Components/Forms verwendet, die kein UI-State-
// Management um den Aufruf wickeln wollen.
export async function startCheckoutAndRedirect(
  input: StartCheckoutInput,
): Promise<never> {
  const res = await startCheckoutAction(input);
  if (!res.ok) {
    throw new Error(res.error);
  }
  redirect(res.checkoutUrl);
}
