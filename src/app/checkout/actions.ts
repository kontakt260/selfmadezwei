"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStripe, getPriceId, getSiteUrl } from "@/lib/stripe/server";
import {
  CLAIM_COOKIE,
  CLAIM_COOKIE_MAX_AGE_SECONDS,
  encodeClaimCookie,
  generateClaimToken,
  hashClaimToken,
} from "@/lib/purchases/claim-token";

// Stripe-Checkout-Initiator (PROJ-6 Backend).
//
// Dieselbe Action wie in der Frontend-Phase, aber: erstellt jetzt eine
// echte Stripe-Checkout-Session und liefert die `session.url` zurück
// (Client redirected dorthin). Auth + Eingabe-Validierung unverändert
// gegenüber Frontend-Phase.
//
// Kauf ohne Konto (2026-11-16): Der ERSTKAUF braucht keine Anmeldung mehr.
// Wer von der Landingpage auf „Jetzt kaufen" klickt, geht direkt durch den
// Checkout und legt sein Konto erst danach an. Für Gäste gilt:
//   - Die Stripe-Session trägt statt `user_id` die Kennung `guest: "1"`
//     und den Hash eines Einlöse-Geheimnisses (`claim_hash`).
//   - Das Geheimnis selbst liegt nur in einem httpOnly-Cookie im Browser
//     des Käufers — damit ordnet er den Kauf nach der Registrierung seinem
//     Konto zu (siehe src/lib/purchases/guest-purchase.ts).
//   - Die Verlängerung bleibt angemeldeten Projekt-Mitgliedern vorbehalten.
//
// Wichtig:
//   - Diese Action läuft serverseitig — der Stripe-Secret-Key bleibt im
//     Server-Process.
//   - Wir verwenden `redirect()` aus next/navigation NICHT direkt, weil
//     sie Server-Actions als Throw-Exception verlässt und der Client
//     dann doch noch eine Antwort braucht. Stattdessen geben wir die
//     `url` zurück und der Client navigiert via `window.location`.

export type CheckoutProductType = "initial" | "renewal";

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
  | { productType: "renewal"; projectId: string };

export type StartCheckoutResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; error: string };

// Laufzeit-Prüfung der Angaben aus dem Kauf-Assistenten. Die Action ist
// ohne Anmeldung aufrufbar — Längen sind deshalb begrenzt (Stripe erlaubt
// pro Metadata-Wert ohnehin höchstens 500 Zeichen).
const initialMetadataSchema = z.object({
  fullName: z.string().max(120),
  isGift: z.boolean(),
  giftRecipientName: z.string().max(120).optional(),
  giftRecipientEmail: z.string().max(254).optional(),
  giftMode: z.enum(["phone-only", "phone-plus-computer"]).optional(),
  giftRecipientRole: z.enum(["projektleiter", "co_author"]).optional(),
  buyerRetainsAccess: z.boolean().optional(),
});

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function startCheckoutAction(
  input: StartCheckoutInput,
): Promise<StartCheckoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Server-Actions sind von außen aufrufbar — Typen schützen zur Laufzeit
  // nicht. Nur die zwei kaufbaren Produkte zulassen (das frühere
  // Vapi-Top-Up ist seit 2026-10-13 nicht mehr kaufbar).
  const requestedType: string = input.productType;
  if (requestedType !== "initial" && requestedType !== "renewal") {
    return { ok: false, error: "Dieses Produkt ist nicht verfügbar." };
  }

  // Eingabe-Validierung pro Produkt-Typ.
  if (input.productType === "initial") {
    const parsed = initialMetadataSchema.safeParse(input.metadata);
    if (!parsed.success) {
      return { ok: false, error: "Bitte prüfen Sie Ihre Angaben." };
    }
    if (!input.metadata.fullName?.trim()) {
      return { ok: false, error: "Name fehlt." };
    }
    if (input.metadata.isGift) {
      if (!input.metadata.giftRecipientName?.trim()) {
        return { ok: false, error: "Name der beschenkten Person fehlt." };
      }
      if (input.metadata.giftMode === "phone-plus-computer") {
        const recipientEmail = input.metadata.giftRecipientEmail?.trim() ?? "";
        if (!recipientEmail) {
          return { ok: false, error: "E-Mail der beschenkten Person fehlt." };
        }
        if (!EMAIL_PATTERN.test(recipientEmail)) {
          return { ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben." };
        }
      }
    }
  } else {
    // Verlängern kann nur, wer angemeldet und Mitglied des Projekts ist.
    if (!user) return { ok: false, error: "Nicht eingeloggt." };
    if (!input.projectId?.trim()) {
      return { ok: false, error: "Projekt-ID fehlt." };
    }
    // Mitgliedschaft prüfen — jedes Projekt-Mitglied (PL oder Co-Autor)
    // darf die Verlängerung kaufen. User-Request 2026-05-21:
    // „jeder muss die Möglichkeit haben, für ein Projekt mehr zu erwerben".
    const { data: membership } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", input.projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
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
  // cancel  → /onboarding (initial) bzw. /projektuebersicht/[pid] (renewal)
  const successUrl = `${siteUrl}/kauf-erfolgreich?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl =
    input.productType === "initial"
      ? `${siteUrl}/onboarding?checkout=cancelled`
      : `${siteUrl}/projektuebersicht/${input.projectId}?checkout=cancelled`;

  // Metadata-Aufbau für den Webhook.
  // String-Werte zwingend: Stripe-Metadata akzeptiert nur strings.
  const metadata: Record<string, string> = {
    product_type: input.productType,
  };
  // Angemeldet: Kauf direkt dem Konto zuordnen. Gast: Einlöse-Geheimnis
  // erzeugen — Stripe und Datenbank sehen nur den Hash.
  const claimToken = user ? null : generateClaimToken();
  if (user) {
    metadata.user_id = user.id;
  } else if (claimToken) {
    metadata.guest = "1";
    metadata.claim_hash = hashClaimToken(claimToken);
  }
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
      // Buyer-Email vorbelegen für UX. Gäste geben sie im Checkout ein —
      // an diese Adresse geht danach die Bitte, das Konto anzulegen.
      customer_email: user?.email ?? undefined,
      allow_promotion_codes: true,
      // Metadata wird vom Webhook gelesen, um die richtige DB-Aktion
      // auszuführen (Projekt anlegen / Renewal).
      metadata,
      // payment_intent_data.metadata zusätzlich befüllen — manche
      // Stripe-Reports zeigen nur die PaymentIntent-Metadata.
      payment_intent_data: { metadata },
    });
    if (!session.url) {
      return { ok: false, error: "Stripe lieferte keine Checkout-URL." };
    }
    if (claimToken) {
      // Einlöse-Geheimnis nur im Browser des Käufers ablegen: httpOnly
      // (kein Zugriff per JavaScript), SameSite=Lax (wird bei der
      // Rückleitung von Stripe und beim Klick auf den Bestätigungs-Link
      // aus der Mail mitgeschickt).
      const cookieStore = await cookies();
      cookieStore.set(
        CLAIM_COOKIE,
        encodeClaimCookie({ sessionId: session.id, token: claimToken }),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: CLAIM_COOKIE_MAX_AGE_SECONDS,
        },
      );
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
