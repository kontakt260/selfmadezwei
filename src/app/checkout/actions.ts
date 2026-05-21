"use server";

import { createClient } from "@/lib/supabase/server";

// Stripe-Checkout-Initiator (PROJ-6 Frontend-Stub).
//
// Diese Server-Action wird von 3 Einstiegspunkten aufgerufen:
//   1. Onboarding-Wizard "Jetzt kaufen" — productType "initial"
//   2. Projektübersicht "Verlängern" — productType "renewal"
//   3. Projektübersicht "Telefonzeit nachkaufen" — productType "vapi"
//
// PROJ-6 Frontend-Phase: die Action validiert die Eingabe + den
// eingeloggten Nutzer, gibt aber NOCH NICHT eine echte Stripe-Session
// zurück. Stattdessen liefert sie ein `{ stubbed: true, ... }`-Objekt
// zurück, das das Frontend als "Backend folgt"-Hinweis anzeigen kann.
//
// In der `/backend PROJ-6`-Phase wird diese Action durch echte
// Stripe-Checkout-Session-Erstellung ersetzt (price_id-Lookup,
// Metadata-Serialisierung, success_url/cancel_url-Aufbau).

export type CheckoutProductType = "initial" | "renewal" | "vapi";

export type InitialMetadata = {
  // Wizard-Auswahl aus dem Onboarding (für den Webhook beim Initial-Kauf)
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
  | { ok: true; stubbed: true; productType: CheckoutProductType }
  | { ok: false; error: string };

export async function startCheckoutAction(
  input: StartCheckoutInput,
): Promise<StartCheckoutResult> {
  // Auth-Check: alle 3 Einstiegspunkte erfordern einen eingeloggten Nutzer.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Nicht eingeloggt." };
  }

  // Input-Validierung pro Produkt-Typ.
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

  // PROJ-6 Frontend-Phase: noch kein echter Stripe-Call, nur Stub-Antwort.
  return {
    ok: true,
    stubbed: true,
    productType: input.productType,
  };
}
