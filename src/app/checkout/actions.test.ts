// PROJ-6 — Checkout-Start: angemeldet und ohne Konto (Gast).
//
// Abgesichert:
//   - Gäste dürfen nur den Erstkauf starten, nie eine Verlängerung.
//   - Für Gäste trägt die Stripe-Session KEINE user_id, sondern die
//     Kennung `guest` und nur den HASH des Einlöse-Geheimnisses.
//   - Das Geheimnis selbst landet ausschließlich im httpOnly-Cookie.

import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_PRICE_ID_INITIAL = "price_initial_test";
process.env.STRIPE_PRICE_ID_RENEWAL = "price_renewal_test";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

const createSessionMock = vi.fn();
vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = { sessions: { create: createSessionMock } };
    constructor() {}
  },
}));

type TestUser = { id: string; email: string } | null;
let currentUser: TestUser = null;
let membership: { role: string } | null = null;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: membership }) }) }),
      }),
    }),
  }),
}));

const cookieSetMock = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSetMock }),
}));

import { startCheckoutAction, type InitialMetadata, type StartCheckoutInput } from "./actions";
import { CLAIM_COOKIE, hashClaimToken, parseClaimCookie } from "@/lib/purchases/claim-token";

const selfPurchase: InitialMetadata = { fullName: "Karla Käufer", isGift: false };

beforeEach(() => {
  currentUser = null;
  membership = null;
  createSessionMock.mockReset();
  createSessionMock.mockResolvedValue({
    id: "cs_test_a1B2c3D4e5F6",
    url: "https://checkout.stripe.test/c/pay/cs_test_a1B2c3D4e5F6",
  });
  cookieSetMock.mockReset();
});

describe("startCheckoutAction — Kauf ohne Konto", () => {
  it("startet den Erstkauf ohne Anmeldung", async () => {
    const res = await startCheckoutAction({ productType: "initial", metadata: selfPurchase });
    expect(res).toEqual({
      ok: true,
      checkoutUrl: "https://checkout.stripe.test/c/pay/cs_test_a1B2c3D4e5F6",
    });

    const params = createSessionMock.mock.calls[0][0];
    expect(params.metadata.guest).toBe("1");
    expect(params.metadata.user_id).toBeUndefined();
    expect(params.metadata.claim_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(params.metadata.full_name).toBe("Karla Käufer");
    // Gast gibt seine E-Mail-Adresse erst im Checkout ein.
    expect(params.customer_email).toBeUndefined();
    expect(params.success_url).toBe(
      "http://localhost:3000/kauf-erfolgreich?session_id={CHECKOUT_SESSION_ID}",
    );
  });

  it("legt das Einlöse-Geheimnis nur im httpOnly-Cookie ab — Stripe sieht den Hash", async () => {
    await startCheckoutAction({ productType: "initial", metadata: selfPurchase });

    expect(cookieSetMock).toHaveBeenCalledTimes(1);
    const [name, value, cookieOptions] = cookieSetMock.mock.calls[0];
    expect(name).toBe(CLAIM_COOKIE);
    expect(cookieOptions).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });

    const parsed = parseClaimCookie(value);
    expect(parsed?.sessionId).toBe("cs_test_a1B2c3D4e5F6");
    const params = createSessionMock.mock.calls[0][0];
    expect(hashClaimToken(parsed!.token)).toBe(params.metadata.claim_hash);
    // Das Geheimnis selbst steht nirgends in den Stripe-Parametern.
    expect(JSON.stringify(params)).not.toContain(parsed!.token);
  });

  const giftWithoutAccess: InitialMetadata = {
    fullName: "Karla Käufer",
    isGift: true,
    giftRecipientName: "Oma Erna",
    giftRecipientEmail: "oma@example.com",
    giftMode: "phone-plus-computer",
    giftRecipientRole: "projektleiter",
    buyerRetainsAccess: false,
  };

  it("Geschenk ohne eigenen Zugang: kein Konto, kein Einlöse-Cookie", async () => {
    await startCheckoutAction({ productType: "initial", metadata: giftWithoutAccess });
    const { metadata } = createSessionMock.mock.calls[0][0];
    expect(metadata.gift_direct).toBe("1");
    expect(metadata.guest).toBeUndefined();
    expect(metadata.claim_hash).toBeUndefined();
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it("Geschenk mit eigenem Zugang braucht weiter ein Konto", async () => {
    await startCheckoutAction({
      productType: "initial",
      metadata: { ...giftWithoutAccess, buyerRetainsAccess: true },
    });
    const { metadata } = createSessionMock.mock.calls[0][0];
    expect(metadata.gift_direct).toBeUndefined();
    expect(metadata.guest).toBe("1");
    expect(cookieSetMock).toHaveBeenCalledTimes(1);
  });

  it("Geschenk „nur erzählen“ braucht weiter ein Konto", async () => {
    await startCheckoutAction({
      productType: "initial",
      metadata: {
        fullName: "Karla Käufer",
        isGift: true,
        giftRecipientName: "Oma Erna",
        giftMode: "phone-only",
        buyerRetainsAccess: false,
      },
    });
    const { metadata } = createSessionMock.mock.calls[0][0];
    expect(metadata.gift_direct).toBeUndefined();
    expect(metadata.guest).toBe("1");
  });

  it("angemeldeter Käufer bleibt beim bisherigen Weg", async () => {
    currentUser = { id: "user-1", email: "karla@example.com" };
    await startCheckoutAction({ productType: "initial", metadata: giftWithoutAccess });
    const { metadata } = createSessionMock.mock.calls[0][0];
    expect(metadata.user_id).toBe("user-1");
    expect(metadata.gift_direct).toBeUndefined();
  });

  it("verweigert Gästen die Verlängerung", async () => {
    const res = await startCheckoutAction({ productType: "renewal", projectId: "proj-1" });
    expect(res).toEqual({ ok: false, error: "Nicht eingeloggt." });
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it("prüft die Angaben auch ohne Anmeldung", async () => {
    const cases: Array<[InitialMetadata, string]> = [
      [{ fullName: "  ", isGift: false }, "Name fehlt."],
      [{ fullName: "x".repeat(121), isGift: false }, "Bitte prüfen Sie Ihre Angaben."],
      [{ fullName: "Karla", isGift: true }, "Name der beschenkten Person fehlt."],
      [
        { fullName: "Karla", isGift: true, giftRecipientName: "Oma", giftMode: "phone-plus-computer" },
        "E-Mail der beschenkten Person fehlt.",
      ],
      [
        {
          fullName: "Karla",
          isGift: true,
          giftRecipientName: "Oma",
          giftMode: "phone-plus-computer",
          giftRecipientEmail: "keine-adresse",
        },
        "Bitte eine gültige E-Mail-Adresse angeben.",
      ],
    ];
    for (const [metadata, error] of cases) {
      const res = await startCheckoutAction({ productType: "initial", metadata });
      expect(res).toEqual({ ok: false, error });
    }
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("lässt nur die zwei kaufbaren Produkte zu", async () => {
    const res = await startCheckoutAction({
      // @ts-expect-error — Laufzeit-Schutz gegen frei erfundene Produkte
      productType: "vapi",
      metadata: selfPurchase,
    });
    expect(res.ok).toBe(false);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});

describe("startCheckoutAction — angemeldet (unverändert)", () => {
  beforeEach(() => {
    currentUser = { id: "user-1", email: "user@example.com" };
  });

  it("ordnet den Erstkauf direkt dem Konto zu — ohne Gast-Kennung und ohne Cookie", async () => {
    const res = await startCheckoutAction({ productType: "initial", metadata: selfPurchase });
    expect(res.ok).toBe(true);
    const params = createSessionMock.mock.calls[0][0];
    expect(params.metadata.user_id).toBe("user-1");
    expect(params.metadata.guest).toBeUndefined();
    expect(params.metadata.claim_hash).toBeUndefined();
    expect(params.customer_email).toBe("user@example.com");
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it("lehnt das eingestellte Vapi-Produkt ab, ohne eine Stripe-Session anzulegen (PROJ-6-Rückbau)", async () => {
    // Server-Actions sind von außen aufrufbar — der alte Produkt-Typ kann
    // trotz TypeScript-Typ zur Laufzeit ankommen.
    const input = { productType: "vapi", projectId: "proj-1" } as unknown as StartCheckoutInput;
    const res = await startCheckoutAction(input);
    expect(res.ok).toBe(false);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("Verlängerung nur für Projekt-Mitglieder", async () => {
    const denied = await startCheckoutAction({ productType: "renewal", projectId: "proj-1" });
    expect(denied).toEqual({ ok: false, error: "Keine Berechtigung für dieses Projekt." });

    membership = { role: "co_author" };
    const allowed = await startCheckoutAction({ productType: "renewal", projectId: "proj-1" });
    expect(allowed.ok).toBe(true);
    expect(createSessionMock.mock.calls[0][0].metadata).toMatchObject({
      user_id: "user-1",
      product_type: "renewal",
      project_id: "proj-1",
    });
  });
});
