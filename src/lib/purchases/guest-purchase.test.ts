// PROJ-6 — Kauf ohne Konto: Erfassen und Einlösen.
//
// Sicherheitsrelevante Regeln, die hier abgesichert sind:
//   - Einlösen nur mit BESTÄTIGTER E-Mail-Adresse des Checkouts oder mit
//     dem Einlöse-Geheimnis aus dem Käufer-Browser.
//   - Ein Kauf wird genau einmal erfüllt (Sperre, auch bei zwei Anläufen).
//   - Scheitert die Erfüllung, bleibt der Anspruch offen und es bleibt kein
//     halbes Projekt zurück.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createFakeSupabase, type FakeDb, type FakeSupabaseOptions } from "@/test/fake-supabase";

const sendInvitationMailMock = vi.fn(async (_input: Record<string, unknown>) => undefined);
vi.mock("@/lib/email/send-invitation", () => ({
  sendInvitationMail: (input: Record<string, unknown>) => sendInvitationMailMock(input),
}));

import { generateClaimToken, hashClaimToken } from "./claim-token";
import {
  claimGuestPurchases,
  hasOpenClaimForEmail,
  isGuestSession,
  recordGuestPurchase,
  type ClaimUser,
} from "./guest-purchase";

const UNIQUE = { purchase_claims: ["stripe_session_id"], payments: ["stripe_session_id"] };

let db: FakeDb;
let options: FakeSupabaseOptions;
const client = () => createFakeSupabase(db, options) as unknown as SupabaseClient<Database>;

const token = generateClaimToken();
const tokenHash = hashClaimToken(token);

function guestSession(overrides: Partial<Record<string, unknown>> = {}, meta: Record<string, string> = {}) {
  return {
    id: "cs_test_guest0001",
    status: "complete",
    payment_status: "paid",
    amount_total: 24900,
    currency: "eur",
    customer_details: { email: "Kaeufer@Example.com" },
    metadata: {
      product_type: "initial",
      guest: "1",
      claim_hash: tokenHash,
      full_name: "Karla Käufer",
      is_gift: "0",
      ...meta,
    },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

const buyer: ClaimUser = { id: "user-buyer", email: "kaeufer@example.com", emailConfirmed: true };
const noStripe = async () => null;

beforeEach(() => {
  db = {
    purchase_claims: [],
    projects: [],
    project_access: [],
    project_members: [],
    invitations: [],
    payments: [],
    profiles: [{ id: "user-buyer", full_name: "Karla Käufer" }],
  };
  options = { unique: UNIQUE };
  sendInvitationMailMock.mockClear();
});

describe("isGuestSession", () => {
  it("erkennt nur Erstkäufe ohne Konto", () => {
    expect(isGuestSession(guestSession())).toBe(true);
    expect(isGuestSession(guestSession({}, { product_type: "renewal" }))).toBe(false);
    expect(isGuestSession(guestSession({}, { user_id: "u1" }))).toBe(false);
    expect(isGuestSession({ metadata: { product_type: "initial", user_id: "u1" } })).toBe(false);
  });
});

describe("recordGuestPurchase", () => {
  it("legt den bezahlten Kauf als offenen Anspruch ab — ohne Projekt", async () => {
    expect(await recordGuestPurchase(client(), guestSession())).toBe("created");
    expect(db.purchase_claims).toHaveLength(1);
    const row = db.purchase_claims[0];
    expect(row.stripe_session_id).toBe("cs_test_guest0001");
    expect(row.buyer_email).toBe("kaeufer@example.com"); // kleingeschrieben
    expect(row.claim_token_hash).toBe(tokenHash);
    expect(row.amount_cents).toBe(24900);
    // Technische Zuordnungsfelder gehören nicht in die Kauf-Angaben.
    expect(row.metadata).toEqual({ product_type: "initial", full_name: "Karla Käufer", is_gift: "0" });
    expect(db.projects).toHaveLength(0);
    expect(db.payments).toHaveLength(0);
  });

  it("ist idempotent (Webhook-Wiederholung)", async () => {
    await recordGuestPurchase(client(), guestSession());
    expect(await recordGuestPurchase(client(), guestSession())).toBe("duplicate");
    expect(db.purchase_claims).toHaveLength(1);
  });

  it("lehnt Sessions ohne gültigen Geheimnis-Hash ab", async () => {
    expect(await recordGuestPurchase(client(), guestSession({}, { claim_hash: "kein-hash" }))).toBe("invalid");
    expect(await recordGuestPurchase(client(), guestSession({}, { guest: "0" }))).toBe("invalid");
    expect(db.purchase_claims).toHaveLength(0);
  });
});

describe("claimGuestPurchases — wer einlösen darf", () => {
  beforeEach(async () => {
    await recordGuestPurchase(client(), guestSession());
  });

  it("bestätigte E-Mail-Adresse des Checkouts: Kauf wird erfüllt", async () => {
    const outcome = await claimGuestPurchases(client(), { user: buyer, cookie: null, retrieveSession: noStripe });

    expect(outcome.claimed).toHaveLength(1);
    expect(outcome.failed).toBe(0);
    expect(db.projects).toHaveLength(1);
    expect(db.projects[0].owner_id).toBe("user-buyer");
    expect(db.project_access).toHaveLength(1);
    expect(db.project_members[0]).toMatchObject({ user_id: "user-buyer", role: "projektleiter" });
    expect(db.payments[0]).toMatchObject({
      stripe_session_id: "cs_test_guest0001",
      user_id: "user-buyer",
      type: "initial_portal_access",
      amount_cents: 24900,
    });
    expect(db.purchase_claims[0].claimed_by).toBe("user-buyer");
    expect(db.purchase_claims[0].claimed_at).toBeTruthy();
    expect(db.purchase_claims[0].project_id).toBe(db.projects[0].id);
  });

  it("UNBESTÄTIGTE E-Mail-Adresse: kein Einlösen", async () => {
    const outcome = await claimGuestPurchases(client(), {
      user: { ...buyer, emailConfirmed: false },
      cookie: null,
      retrieveSession: noStripe,
    });
    expect(outcome.claimed).toHaveLength(0);
    expect(db.projects).toHaveLength(0);
    expect(db.purchase_claims[0].claimed_at ?? null).toBeNull();
  });

  it("fremdes Konto ohne Geheimnis: kein Einlösen", async () => {
    const outcome = await claimGuestPurchases(client(), {
      user: { id: "user-fremd", email: "fremd@example.com", emailConfirmed: true },
      cookie: null,
      retrieveSession: noStripe,
    });
    expect(outcome.claimed).toHaveLength(0);
    expect(db.projects).toHaveLength(0);
  });

  it("Einlöse-Geheimnis aus dem Käufer-Browser: auch mit anderer E-Mail-Adresse", async () => {
    db.profiles.push({ id: "user-andere-mail", full_name: "Karla K." });
    const outcome = await claimGuestPurchases(client(), {
      user: { id: "user-andere-mail", email: "privat@example.com", emailConfirmed: true },
      cookie: { sessionId: "cs_test_guest0001", token },
      retrieveSession: noStripe,
    });
    expect(outcome.claimed).toHaveLength(1);
    expect(outcome.cookieSpent).toBe(true);
    expect(db.projects[0].owner_id).toBe("user-andere-mail");
  });

  it("falsches Geheimnis: kein Einlösen", async () => {
    const outcome = await claimGuestPurchases(client(), {
      user: { id: "user-fremd", email: "fremd@example.com", emailConfirmed: true },
      cookie: { sessionId: "cs_test_guest0001", token: generateClaimToken() },
      retrieveSession: noStripe,
    });
    expect(outcome.claimed).toHaveLength(0);
    expect(outcome.cookieSpent).toBe(false);
    expect(db.projects).toHaveLength(0);
  });

  it("ein Kauf wird nur einmal erfüllt", async () => {
    await claimGuestPurchases(client(), { user: buyer, cookie: null, retrieveSession: noStripe });
    const second = await claimGuestPurchases(client(), {
      user: buyer,
      cookie: { sessionId: "cs_test_guest0001", token },
      retrieveSession: noStripe,
    });
    expect(second.claimed).toHaveLength(0);
    // Das Geheimnis ist verbraucht → Cookie darf weg.
    expect(second.cookieSpent).toBe(true);
    expect(db.projects).toHaveLength(1);
    expect(db.payments).toHaveLength(1);
  });
});

describe("claimGuestPurchases — Webhook noch nicht eingetroffen", () => {
  const cookie = { sessionId: "cs_test_guest0001", token };

  it("prüft die Session direkt bei Stripe und löst ein", async () => {
    const retrieveSession = vi.fn(async () => guestSession());
    const outcome = await claimGuestPurchases(client(), {
      user: { id: "user-buyer", email: "andere@example.com", emailConfirmed: true },
      cookie,
      retrieveSession,
    });
    expect(retrieveSession).toHaveBeenCalledWith("cs_test_guest0001");
    expect(outcome.claimed).toHaveLength(1);
    expect(db.purchase_claims).toHaveLength(1);
  });

  it("unbezahlte Session: nichts erfassen", async () => {
    const outcome = await claimGuestPurchases(client(), {
      user: buyer,
      cookie,
      retrieveSession: async () => guestSession({ status: "open", payment_status: "unpaid" }),
    });
    expect(outcome.claimed).toHaveLength(0);
    expect(db.purchase_claims).toHaveLength(0);
    expect(outcome.cookieSpent).toBe(false);
  });

  it("Session gehört zu einem anderen Geheimnis: nichts erfassen", async () => {
    const outcome = await claimGuestPurchases(client(), {
      user: { id: "user-fremd", email: "fremd@example.com", emailConfirmed: true },
      cookie: { sessionId: "cs_test_guest0001", token: generateClaimToken() },
      retrieveSession: async () => guestSession(),
    });
    expect(outcome.claimed).toHaveLength(0);
    expect(db.purchase_claims).toHaveLength(0);
  });

  it("verfallene Session: Cookie gilt als verbraucht", async () => {
    const outcome = await claimGuestPurchases(client(), {
      user: buyer,
      cookie,
      retrieveSession: async () => guestSession({ status: "expired", payment_status: "unpaid" }),
    });
    expect(outcome.claimed).toHaveLength(0);
    expect(outcome.cookieSpent).toBe(true);
  });

  it("Stripe nicht erreichbar: kein Absturz", async () => {
    const outcome = await claimGuestPurchases(client(), {
      user: buyer,
      cookie,
      retrieveSession: async () => {
        throw new Error("network");
      },
    });
    expect(outcome).toEqual({ claimed: [], failed: 0, cookieSpent: false });
  });
});

describe("claimGuestPurchases — Fehler und Geschenk", () => {
  it("scheitert die Erfüllung, bleibt der Anspruch offen und kein halbes Projekt zurück", async () => {
    await recordGuestPurchase(client(), guestSession());
    options = {
      unique: UNIQUE,
      failOn: (op, table) => (op === "insert" && table === "project_members" ? "db down" : null),
    };
    const outcome = await claimGuestPurchases(client(), { user: buyer, cookie: null, retrieveSession: noStripe });

    expect(outcome.claimed).toHaveLength(0);
    expect(outcome.failed).toBe(1);
    expect(db.projects).toHaveLength(0); // aufgeräumt
    expect(db.payments).toHaveLength(0);
    expect(db.purchase_claims[0].claimed_at).toBeNull();
    expect(db.purchase_claims[0].claimed_by).toBeNull();

    // Zweiter Anlauf nach behobener Störung gelingt.
    options = { unique: UNIQUE };
    const retry = await claimGuestPurchases(client(), { user: buyer, cookie: null, retrieveSession: noStripe });
    expect(retry.claimed).toHaveLength(1);
    expect(db.projects).toHaveLength(1);
  });

  it("Geschenk „Auch am Computer“: Einladung entsteht und wird beim Einlösen verschickt", async () => {
    await recordGuestPurchase(
      client(),
      guestSession({}, {
        is_gift: "1",
        gift_mode: "phone-plus-computer",
        gift_recipient_email: "Oma@Example.com",
        gift_recipient_role: "co_author",
        buyer_retains_access: "1",
      }),
    );
    const outcome = await claimGuestPurchases(client(), { user: buyer, cookie: null, retrieveSession: noStripe });

    expect(outcome.claimed).toHaveLength(1);
    expect(db.invitations).toHaveLength(1);
    expect(db.invitations[0]).toMatchObject({ email: "oma@example.com", role: "co_author" });
    // Geschenk-Einladungen gelten so lange wie der Portal-Zugang.
    expect(db.invitations[0].expires_at).toBe(db.project_access[0].expires_at);
    expect(sendInvitationMailMock).toHaveBeenCalledTimes(1);
    expect(sendInvitationMailMock.mock.calls[0][0]).toMatchObject({
      to: "Oma@Example.com",
      inviterName: "Karla Käufer",
      inviterEmail: "kaeufer@example.com",
      isGift: true,
    });
  });

  it("Geschenk ohne eigenen Zugang: Käufer wird kein Mitglied, Empfänger Projektleiter", async () => {
    await recordGuestPurchase(
      client(),
      guestSession({}, {
        is_gift: "1",
        gift_mode: "phone-plus-computer",
        gift_recipient_email: "oma@example.com",
        buyer_retains_access: "0",
      }),
    );
    await claimGuestPurchases(client(), { user: buyer, cookie: null, retrieveSession: noStripe });
    expect(db.project_members).toHaveLength(0);
    expect(db.invitations[0].role).toBe("projektleiter");
  });
});

describe("hasOpenClaimForEmail", () => {
  it("meldet offene Käufe nur für bestätigte Adressen", async () => {
    await recordGuestPurchase(client(), guestSession());
    expect(await hasOpenClaimForEmail(client(), buyer)).toBe(true);
    expect(await hasOpenClaimForEmail(client(), { ...buyer, emailConfirmed: false })).toBe(false);
    expect(await hasOpenClaimForEmail(client(), { ...buyer, email: "x@example.com" })).toBe(false);
    await claimGuestPurchases(client(), { user: buyer, cookie: null, retrieveSession: noStripe });
    expect(await hasOpenClaimForEmail(client(), buyer)).toBe(false);
  });
});
