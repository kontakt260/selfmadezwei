// PROJ-6 Webhook-Route Pflicht-Tests (Tech-Design Sektion L).
//
// Diese Tests stehen für die K-Erfolgskriterien aus dem PROJ-6-Spec:
//   1. Webhook-Signaturen: 400 bei ungültiger Signatur.
//   2. Idempotenz: zweimaliger Webhook → ein payments-Eintrag.
//   3. Renewal-GREATEST-Trick: kein Zeitverlust bei früher Verlängerung.
//   4. Altprodukt „vapi" wird quittiert, ohne State zu ändern.
//
// Negativtest „Paywall-Lockdown" (Pflicht 1) ist ein SQL-Test gegen
// project_access — siehe tests/PROJ-6-stripe-zahlungen.spec.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { addTwelveMonths } from "@/lib/purchases/access-period";

// Wir setzen Env-Vars BEVOR irgendein Modul importiert wird, damit
// `getStripe()` und `createServiceRoleClient()` nicht beim Bootstrap
// werfen. Echte Stripe-API-Aufrufe werden via vi.mock unten unterbunden.
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dummy";
process.env.STRIPE_PRICE_ID_INITIAL = "price_initial_test";
process.env.STRIPE_PRICE_ID_RENEWAL = "price_renewal_test";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-dummy";

// ─── Mock Stripe SDK ─────────────────────────────────────────────────
//
// constructEvent wird vom Test gesteuert: gibt entweder ein synthetisches
// Event zurück oder wirft (= ungültige Signatur).

const constructEventMock = vi.fn();
vi.mock("stripe", () => {
  return {
    default: class StripeMock {
      webhooks = { constructEvent: constructEventMock };
      checkout = { sessions: { retrieve: vi.fn() } };
      constructor() {}
    },
  };
});

// ─── Mock Mail-Versand (PROJ-11) ────────────────────────────────────
//
// Die Send-Helper werden ersetzt, damit die Tests prüfen können, welche
// Mails der Webhook auslöst — ohne Resend.

const sendInvitationMailMock = vi.fn(async (_input: Record<string, unknown>) => undefined);
const sendPortalPurchaseMailMock = vi.fn(async (_input: Record<string, unknown>) => undefined);
const sendRenewalMailMock = vi.fn(async (_input: Record<string, unknown>) => undefined);
const sendRenewalInfoMailMock = vi.fn(async (_input: Record<string, unknown>) => undefined);
vi.mock("@/lib/email/send-invitation", () => ({
  sendInvitationMail: (input: Record<string, unknown>) => sendInvitationMailMock(input),
}));
vi.mock("@/lib/email/send-portal-purchase", () => ({
  sendPortalPurchaseMail: (input: Record<string, unknown>) => sendPortalPurchaseMailMock(input),
}));
vi.mock("@/lib/email/send-renewal", () => ({
  sendRenewalMail: (input: Record<string, unknown>) => sendRenewalMailMock(input),
  sendRenewalInfoMail: (input: Record<string, unknown>) => sendRenewalInfoMailMock(input),
}));
const sendGuestPurchaseMailMock = vi.fn(async (_input: Record<string, unknown>) => undefined);
vi.mock("@/lib/email/send-guest-purchase", () => ({
  sendGuestPurchaseMail: (input: Record<string, unknown>) => sendGuestPurchaseMailMock(input),
}));

const sendDeletedProjectAlertMock = vi.fn(async (_input: Record<string, unknown>) => undefined);
vi.mock("@/lib/email/send-deleted-project-alert", () => ({
  sendDeletedProjectPaymentAlert: (input: Record<string, unknown>) =>
    sendDeletedProjectAlertMock(input),
}));

const markNarrationDraftMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/purchases/narration-draft", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/purchases/narration-draft")>()),
  markNarrationDraft: (_client: unknown, id: string, status: string) =>
    (markNarrationDraftMock as unknown as (id: string, status: string) => Promise<void>)(id, status),
}));

// ─── Mock Supabase Service-Role-Client ───────────────────────────────
//
// Der Webhook ruft Insert/Upsert/Select-Methoden. Wir tracken alle
// Aufrufe in einem fakeDb-Objekt und verifizieren die Ergebnisse.

type FakeRows = {
  payments: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  project_access: Array<Record<string, unknown>>;
  project_members: Array<Record<string, unknown>>;
  invitations: Array<Record<string, unknown>>;
  // PROJ-11: Webhook-Route liest profiles für die Mail-Personalisierung
  // (resolveBuyerEmail). Der Test braucht das nicht zu bestücken — ein
  // leeres Array reicht, damit maybeSingle null zurückgibt.
  profiles: Array<Record<string, unknown>>;
  // Kauf ohne Konto (2026-11-16): offene Ansprüche aus Gast-Checkouts.
  purchase_claims: Array<Record<string, unknown>>;
  // PROJ-26: gelöschte Projekte.
  trash_projects: Array<Record<string, unknown>>;
};

let fakeDb: FakeRows;
let failNextAccessWrite = false;
let failNextPaymentReference = false;
let failNextRestore = false;

// Builder, der sowohl direkt-awaitbar ist als auch .select().single()
// unterstützt. Push passiert genau einmal — entweder im `then` der
// direkten await-Variante ODER beim Aufruf von .single().
function makeInsertBuilder(table: keyof FakeRows, row: Record<string, unknown> | Record<string, unknown>[]) {
  const r = Array.isArray(row) ? row[0] : row;
  // Wie in Postgres: zweite Zeile mit derselben Session → unique_violation.
  // Geprüft wird erst beim Ausführen, damit parallele Aufrufe realistisch sind.
  const uniqueError = { code: "23505", message: "duplicate key value" };
  const conflicts = () =>
    (table === "purchase_claims" || table === "payments") &&
    fakeDb[table].some((c) => c.stripe_session_id === r.stripe_session_id);
  let pushed = false;
  const push = () => {
    if (pushed) return null;
    pushed = true;
    const withId = { id: `${table}-${fakeDb[table].length + 1}`, ...r };
    fakeDb[table].push(withId);
    return withId;
  };
  return {
    select(_cols?: string) {
      return {
        single: async () => {
          if (conflicts()) return { data: null, error: uniqueError };
          const withId = push();
          return { data: withId, error: null };
        },
      };
    },
    then(resolve: (v: { data: null; error: typeof uniqueError | null }) => unknown) {
      if (conflicts()) return Promise.resolve({ data: null, error: uniqueError }).then(resolve);
      push();
      return Promise.resolve({ data: null, error: null }).then(resolve);
    },
  };
}

const supabaseMock = {
  // PROJ-28: Eine Zahlung holt wegen Ablauf verschobene Projekte zurück.
  rpc: async (_name: string, args: { p_project_id: string }) => {
    if (failNextRestore) {
      failNextRestore = false;
      return { data: null, error: { message: "db down" } };
    }
    const entry = fakeDb.trash_projects.find((row) => row.project_id === args.p_project_id);
    if (!entry) return { data: { status: "not_in_trash" }, error: null };
    if (entry.reason !== "expired") return { data: { status: "deleted_by_customer" }, error: null };
    fakeDb.trash_projects = fakeDb.trash_projects.filter((row) => row !== entry);
    return { data: { status: "restored" }, error: null };
  },
  from: (table: keyof FakeRows) => ({
    select: (_cols: string) => ({
      eq: (col: string, val: unknown) => ({
        maybeSingle: async () => {
          const found = fakeDb[table].find(
            (r) => (r as Record<string, unknown>)[col] === val,
          );
          return { data: found ?? null, error: null };
        },
        limit: async (n: number) => ({
          data: fakeDb[table]
            .filter((r) => (r as Record<string, unknown>)[col] === val)
            .slice(0, n),
          error: null,
        }),
      }),
    }),
    insert: (row: Record<string, unknown> | Record<string, unknown>[]) => {
      if (failNextPaymentReference && table === "payments") {
        failNextPaymentReference = false;
        return Promise.resolve({
          data: null,
          error: { code: "23503", message: "violates foreign key constraint" },
        });
      }
      return makeInsertBuilder(table, row);
    },
    delete: () => ({
      eq: async (col: string, val: unknown) => {
        fakeDb[table] = fakeDb[table].filter((r) => r[col] !== val);
        return { data: null, error: null };
      },
    }),
    upsert: (row: Record<string, unknown>, _opts?: { onConflict?: string }) => {
      if (failNextAccessWrite && table === "project_access") {
        failNextAccessWrite = false;
        return Promise.resolve({ data: null, error: { message: "db down" } });
      }
      const onConflict = _opts?.onConflict;
      if (onConflict) {
        const existingIdx = fakeDb[table].findIndex(
          (r) => (r as Record<string, unknown>)[onConflict] === row[onConflict],
        );
        if (existingIdx >= 0) {
          fakeDb[table][existingIdx] = { ...fakeDb[table][existingIdx], ...row };
          return Promise.resolve({ data: null, error: null });
        }
      }
      fakeDb[table].push(row);
      return Promise.resolve({ data: null, error: null });
    },
  }),
};

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => supabaseMock,
}));

// ─── Helpers ─────────────────────────────────────────────────────────

function makeSession(
  overrides: Partial<{
    id: string;
    payment_status: string;
    metadata: Record<string, string>;
    amount_total: number;
    currency: string;
    customer_details: { email: string };
  }> = {},
) {
  return {
    customer_details: overrides.customer_details,
    id: overrides.id ?? "cs_test_123",
    payment_status: overrides.payment_status ?? "paid",
    status: "complete" as const,
    metadata: overrides.metadata ?? {},
    amount_total: overrides.amount_total ?? 24900,
    currency: overrides.currency ?? "eur",
  };
}

async function callPost(rawBody: string, signature: string | null) {
  // Lazy-load die Route nach allen vi.mock-Setups.
  const { POST } = await import("./route");
  const headers = new Headers();
  if (signature !== null) headers.set("stripe-signature", signature);
  const req = new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers,
    body: rawBody,
  });
  // NextRequest erbt von Request; Cast genügt für die Route.
  // @ts-expect-error — minimaler Stub
  return POST(req);
}

beforeEach(() => {
  fakeDb = {
    payments: [],
    projects: [],
    project_access: [],
    project_members: [],
    invitations: [],
    profiles: [
      { id: "user-1", email: "user@example.com", full_name: "Test User" },
      { id: "buyer-1", email: "buyer@example.com", full_name: "Bea Buyer" },
    ],
    purchase_claims: [],
    trash_projects: [],
  };
  failNextAccessWrite = false;
  failNextPaymentReference = false;
  sendDeletedProjectAlertMock.mockClear();
  constructEventMock.mockReset();
  sendInvitationMailMock.mockClear();
  sendPortalPurchaseMailMock.mockClear();
  sendRenewalMailMock.mockClear();
  sendRenewalInfoMailMock.mockClear();
  sendGuestPurchaseMailMock.mockClear();
});

// ─── Tests ───────────────────────────────────────────────────────────

describe("Stripe webhook — signature check (Pflicht-Test 2)", () => {
  it("returns 400 when stripe-signature header is missing", async () => {
    const res = await callPost("{}", null);
    expect(res.status).toBe(400);
  });

  it("returns 400 when signature is invalid", async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error("Invalid signature");
    });
    const res = await callPost("{}", "t=123,v1=bogus");
    expect(res.status).toBe(400);
  });
});

describe("Stripe webhook — idempotency (Pflicht-Test 3)", () => {
  it("returns 200 with duplicate:true on second call with same session.id", async () => {
    const session = makeSession({
      id: "cs_dupe",
      metadata: { product_type: "renewal", user_id: "user-1", project_id: "proj-1" },
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: session },
    });
    fakeDb.payments.push({ stripe_session_id: "cs_dupe" });

    const res = await callPost("body", "valid-sig");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.duplicate).toBe(true);
    // Kein NEUER payments-Eintrag.
    expect(fakeDb.payments.length).toBe(1);
  });
});

describe("Stripe webhook — initial purchase (5 gift variants)", () => {
  it("creates project + member + 12-month access for self-purchase", async () => {
    const session = makeSession({
      metadata: {
        product_type: "initial",
        user_id: "user-1",
        full_name: "Test User",
        is_gift: "0",
      },
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: session },
    });

    const res = await callPost("body", "valid-sig");
    expect(res.status).toBe(200);

    expect(fakeDb.projects.length).toBe(1);
    expect(fakeDb.project_access.length).toBe(1);
    expect(fakeDb.project_members.length).toBe(1);
    expect(fakeDb.project_members[0].role).toBe("projektleiter");
    expect(fakeDb.invitations.length).toBe(0);
    expect(fakeDb.payments.length).toBe(1);
    expect(fakeDb.payments[0].type).toBe("initial_portal_access");
  });

  it("gift 'Auch Computer', buyer retains access -> buyer projektleiter + invitation co_author", async () => {
    const session = makeSession({
      metadata: {
        product_type: "initial",
        user_id: "buyer-1",
        full_name: "Buyer",
        is_gift: "1",
        gift_mode: "phone-plus-computer",
        buyer_retains_access: "1",
        gift_recipient_email: "oma@example.com",
        gift_recipient_role: "co_author",
      },
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: session },
    });

    const res = await callPost("body", "valid-sig");
    expect(res.status).toBe(200);

    expect(fakeDb.project_members.length).toBe(1);
    expect(fakeDb.project_members[0].user_id).toBe("buyer-1");
    expect(fakeDb.project_members[0].role).toBe("projektleiter");
    expect(fakeDb.invitations.length).toBe(1);
    expect(fakeDb.invitations[0].email).toBe("oma@example.com");
    expect(fakeDb.invitations[0].role).toBe("co_author");
    // Geschenk-Einladungen gelten so lange wie der Projektzugang.
    expect(fakeDb.invitations[0].expires_at).toBe(fakeDb.project_access[0].expires_at);
  });

  it("gift 'Auch Computer', buyer skip -> NO member + invitation projektleiter", async () => {
    const session = makeSession({
      metadata: {
        product_type: "initial",
        user_id: "buyer-1",
        full_name: "Buyer",
        is_gift: "1",
        gift_mode: "phone-plus-computer",
        buyer_retains_access: "0",
        gift_recipient_email: "oma@example.com",
      },
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: session },
    });

    const res = await callPost("body", "valid-sig");
    expect(res.status).toBe(200);

    expect(fakeDb.project_members.length).toBe(0);
    expect(fakeDb.invitations.length).toBe(1);
    expect(fakeDb.invitations[0].role).toBe("projektleiter");
    // Ohne Mitglied könnte niemand eine abgelaufene Einladung erneuern —
    // deshalb gilt sie bis zum Ende des Projektzugangs (~12 Monate).
    expect(fakeDb.invitations[0].expires_at).toBe(fakeDb.project_access[0].expires_at);
    const validForDays =
      (new Date(fakeDb.invitations[0].expires_at as string).getTime() - Date.now()) / 86_400_000;
    expect(validForDays).toBeGreaterThan(360);
  });
});

describe("Stripe webhook — purchase mails (PROJ-11)", () => {
  function giftSession(overrides: Record<string, string>) {
    return makeSession({
      metadata: {
        product_type: "initial",
        user_id: "buyer-1",
        is_gift: "1",
        gift_recipient_email: "Oma@Example.com",
        ...overrides,
      },
    });
  }

  it("self-purchase: only the purchase mail, with portal access", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: makeSession({
          metadata: { product_type: "initial", user_id: "user-1", is_gift: "0" },
        }),
      },
    });
    await callPost("body", "valid-sig");

    expect(sendInvitationMailMock).not.toHaveBeenCalled();
    expect(sendPortalPurchaseMailMock).toHaveBeenCalledTimes(1);
    expect(sendPortalPurchaseMailMock.mock.calls[0][0]).toMatchObject({
      to: "user@example.com",
      fullName: "Test User",
      amountFormatted: expect.stringContaining("249,00"),
      buyerHasAccess: true,
      giftRecipientEmail: undefined,
      giftRecipientName: undefined,
      invoiceUrl: undefined,
      // Button „Zur Projektübersicht" führt ins neu angelegte Projekt.
      projectId: fakeDb.projects[0].id,
    });
  });

  it("gift without own access (BUG-4/BUG-3): invitation to the recipient + gift confirmation to the buyer", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: giftSession({
          gift_mode: "phone-plus-computer",
          buyer_retains_access: "0",
        }),
      },
    });
    await callPost("body", "valid-sig");

    expect(sendInvitationMailMock).toHaveBeenCalledTimes(1);
    expect(sendInvitationMailMock.mock.calls[0][0]).toMatchObject({
      to: "Oma@Example.com",
      inviterName: "Bea Buyer",
      inviterEmail: "buyer@example.com",
      role: "projektleiter",
      token: fakeDb.invitations[0].token,
      isGift: true,
    });
    expect(sendPortalPurchaseMailMock).toHaveBeenCalledTimes(1);
    expect(sendPortalPurchaseMailMock.mock.calls[0][0]).toMatchObject({
      to: "buyer@example.com",
      buyerHasAccess: false,
      giftRecipientEmail: "Oma@Example.com",
    });
  });

  it("gift with own access: invitation as co-author + regular purchase mail", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: giftSession({
          gift_mode: "phone-plus-computer",
          buyer_retains_access: "1",
          gift_recipient_role: "co_author",
        }),
      },
    });
    await callPost("body", "valid-sig");

    expect(sendInvitationMailMock.mock.calls[0][0]).toMatchObject({
      role: "co_author",
      isGift: true,
    });
    expect(sendPortalPurchaseMailMock.mock.calls[0][0]).toMatchObject({
      buyerHasAccess: true,
      giftRecipientEmail: "Oma@Example.com",
    });
  });

  it("gift 'Nur per Sprachnachricht': no portal invitation, buyer keeps access, mail names the recipient", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: giftSession({
          gift_mode: "phone-only",
          gift_recipient_email: "",
          gift_recipient_name: " Oma Erna ",
        }),
      },
    });
    await callPost("body", "valid-sig");

    expect(sendInvitationMailMock).not.toHaveBeenCalled();
    expect(sendPortalPurchaseMailMock.mock.calls[0][0]).toMatchObject({
      buyerHasAccess: true,
      giftRecipientEmail: undefined,
      giftRecipientName: "Oma Erna",
    });
  });

  it("gift with invitation does not add the name — the mail names the address", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: giftSession({
          gift_mode: "phone-plus-computer",
          buyer_retains_access: "1",
          gift_recipient_name: "Oma Erna",
        }),
      },
    });
    await callPost("body", "valid-sig");

    expect(sendPortalPurchaseMailMock.mock.calls[0][0]).toMatchObject({
      giftRecipientEmail: "Oma@Example.com",
      giftRecipientName: undefined,
    });
  });

  it("still answers 200 when a mail helper fails — payment is already stored", async () => {
    sendPortalPurchaseMailMock.mockRejectedValueOnce(new Error("resend down"));
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: makeSession({
          metadata: { product_type: "initial", user_id: "user-1", is_gift: "0" },
        }),
      },
    });
    const res = await callPost("body", "valid-sig");
    expect(res.status).toBe(200);
    expect(fakeDb.payments.length).toBe(1);
  });

  it("renewal: confirmation mail with the new expiry date", async () => {
    fakeDb.project_access.push({
      project_id: "proj-1",
      expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: makeSession({
          metadata: { product_type: "renewal", user_id: "user-1", project_id: "proj-1" },
          amount_total: 9900,
        }),
      },
    });
    await callPost("body", "valid-sig");

    expect(sendRenewalMailMock).toHaveBeenCalledTimes(1);
    expect(sendRenewalMailMock.mock.calls[0][0]).toMatchObject({
      to: "user@example.com",
      amountFormatted: expect.stringContaining("99,00"),
      projectName: expect.any(String),
    });
    expect(sendRenewalInfoMailMock).not.toHaveBeenCalled();
  });

  it("renewal for a deleted project: payment stays booked and support is told (PROJ-26)", async () => {
    fakeDb.trash_projects.push({ project_id: "proj-1" });
    fakeDb.project_access.push({
      project_id: "proj-1",
      expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: makeSession({
          metadata: { product_type: "renewal", user_id: "user-1", project_id: "proj-1" },
          amount_total: 9900,
        }),
      },
    });

    const res = await callPost("body", "valid-sig");

    expect(res.status).toBe(200);
    expect(fakeDb.payments).toHaveLength(1);
    expect(sendDeletedProjectAlertMock).toHaveBeenCalledTimes(1);
    expect(sendDeletedProjectAlertMock.mock.calls[0][0]).toMatchObject({ projectId: "proj-1" });
    expect(fakeDb.trash_projects).toHaveLength(1);
    expect(sendRenewalMailMock).not.toHaveBeenCalled();
  });

  it("renewal for a project moved because it expired brings it back (PROJ-28 BUG-2)", async () => {
    fakeDb.trash_projects.push({ project_id: "proj-1", reason: "expired" });
    fakeDb.project_access.push({
      project_id: "proj-1",
      expires_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: makeSession({
          metadata: { product_type: "renewal", user_id: "user-1", project_id: "proj-1" },
          amount_total: 9900,
        }),
      },
    });

    const res = await callPost("body", "valid-sig");

    expect(res.status).toBe(200);
    expect(fakeDb.payments).toHaveLength(1);
    expect(fakeDb.trash_projects).toHaveLength(0);
    expect(new Date(fakeDb.project_access[0].expires_at as string).getTime()).toBeGreaterThan(Date.now());
    expect(sendDeletedProjectAlertMock).not.toHaveBeenCalled();
    expect(sendRenewalMailMock).toHaveBeenCalledTimes(1);
  });

  it("tells support when the restore fails for a project in the trash (PROJ-28 BUG-2)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    failNextRestore = true;
    fakeDb.trash_projects.push({ project_id: "proj-1", reason: "expired" });
    fakeDb.project_access.push({
      project_id: "proj-1",
      expires_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: makeSession({
          metadata: { product_type: "renewal", user_id: "user-1", project_id: "proj-1" },
          amount_total: 9900,
        }),
      },
    });

    const res = await callPost("body", "valid-sig");

    expect(res.status).toBe(200);
    expect(fakeDb.payments).toHaveLength(1);
    expect(sendDeletedProjectAlertMock).toHaveBeenCalledTimes(1);
    expect(sendRenewalMailMock).not.toHaveBeenCalled();
  });

  it("a failed check on a normal project still confirms the renewal (PROJ-28)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    failNextRestore = true;
    fakeDb.project_access.push({
      project_id: "proj-1",
      expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: makeSession({
          metadata: { product_type: "renewal", user_id: "user-1", project_id: "proj-1" },
          amount_total: 9900,
        }),
      },
    });

    await callPost("body", "valid-sig");

    expect(sendDeletedProjectAlertMock).not.toHaveBeenCalled();
    expect(sendRenewalMailMock).toHaveBeenCalledTimes(1);
  });

  it("renewal for a finally deleted project: payment is booked, support must refund (PROJ-26 BUG-3)", async () => {
    failNextPaymentReference = true;
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: makeSession({
          metadata: { product_type: "renewal", user_id: "user-1", project_id: "proj-gone" },
          amount_total: 9900,
        }),
      },
    });

    const res = await callPost("body", "valid-sig");

    expect(res.status).toBe(200);
    expect(fakeDb.payments).toHaveLength(1);
    expect(fakeDb.payments[0]).toMatchObject({ project_id: null, user_id: "user-1" });
    expect(fakeDb.project_access).toHaveLength(0);
    expect(sendDeletedProjectAlertMock).toHaveBeenCalledTimes(1);
    expect(sendDeletedProjectAlertMock.mock.calls[0][0]).toMatchObject({
      projectId: "proj-gone",
      finallyDeleted: true,
    });
    expect(sendRenewalMailMock).not.toHaveBeenCalled();
  });

  it("renewal after the buyer deleted the account: the project still gets its time (PROJ-26 BUG-3)", async () => {
    failNextPaymentReference = true;
    fakeDb.projects.push({ id: "proj-1", title: "Lebensbuch" });
    fakeDb.project_access.push({
      project_id: "proj-1",
      expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const before = fakeDb.project_access[0].expires_at as string;
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: makeSession({
          metadata: { product_type: "renewal", user_id: "account-gone", project_id: "proj-1" },
          amount_total: 9900,
        }),
      },
    });

    const res = await callPost("body", "valid-sig");

    expect(res.status).toBe(200);
    expect(fakeDb.payments[0]).toMatchObject({ project_id: "proj-1", user_id: null });
    expect(new Date(fakeDb.project_access[0].expires_at as string).getTime()).toBeGreaterThan(
      new Date(before).getTime(),
    );
    expect(sendDeletedProjectAlertMock).not.toHaveBeenCalled();
  });

  it("renewal for a normal project does not alert support (PROJ-26)", async () => {
    fakeDb.project_access.push({
      project_id: "proj-1",
      expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: makeSession({
          metadata: { product_type: "renewal", user_id: "user-1", project_id: "proj-1" },
          amount_total: 9900,
        }),
      },
    });

    await callPost("body", "valid-sig");

    expect(sendDeletedProjectAlertMock).not.toHaveBeenCalled();
  });

  it("renewal by the gifted person: buyer and every other member get the info (Jakob, 2026-11-19)", async () => {
    // Beschenkte Person (user-1) verlängert; Käuferin (buyer-1) ist
    // ebenfalls Mitglied und muss davon erfahren.
    fakeDb.projects.push({ id: "proj-1", title: "Omas Lebensbuch" });
    fakeDb.project_members.push(
      { project_id: "proj-1", user_id: "user-1", role: "projektleiter" },
      { project_id: "proj-1", user_id: "buyer-1", role: "co_author" },
      { project_id: "proj-2", user_id: "someone-else", role: "projektleiter" },
    );
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: makeSession({
          metadata: { product_type: "renewal", user_id: "user-1", project_id: "proj-1" },
          amount_total: 9900,
        }),
      },
    });
    await callPost("body", "valid-sig");

    expect(sendRenewalMailMock).toHaveBeenCalledTimes(1);
    expect(sendRenewalMailMock.mock.calls[0][0]).toMatchObject({
      to: "user@example.com",
      projectName: "Omas Lebensbuch",
      projectId: "proj-1",
    });
    expect(sendRenewalInfoMailMock).toHaveBeenCalledTimes(1);
    expect(sendRenewalInfoMailMock.mock.calls[0][0]).toMatchObject({
      to: "buyer@example.com",
      fullName: "Bea Buyer",
      renewedBy: "Test User",
      projectName: "Omas Lebensbuch",
      projectId: "proj-1",
      newExpiresAtFormatted: expect.any(String),
    });
    // Info-Mail enthält weder Betrag noch Rechnung.
    expect(sendRenewalInfoMailMock.mock.calls[0][0]).not.toHaveProperty("amountFormatted");
    expect(sendRenewalInfoMailMock.mock.calls[0][0]).not.toHaveProperty("invoiceUrl");
  });
});

describe("Stripe webhook — renewal GREATEST-trick (Pflicht-Test 6)", () => {
  it("appends 12 months to existing expires_at instead of NOW() + 12mo when still active", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // +60 days
    fakeDb.project_access.push({
      project_id: "proj-1",
      expires_at: futureExpiry.toISOString(),
    });

    const session = makeSession({
      metadata: {
        product_type: "renewal",
        user_id: "user-1",
        project_id: "proj-1",
      },
      amount_total: 9900,
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: session },
    });

    const res = await callPost("body", "valid-sig");
    expect(res.status).toBe(200);

    expect(fakeDb.project_access.length).toBe(1);
    const newExpiry = new Date(fakeDb.project_access[0].expires_at as string);
    // Soll futureExpiry + 12 Monate sein, NICHT NOW + 12 Monate.
    const expected = addTwelveMonths(futureExpiry);
    const diffDays = Math.abs(newExpiry.getTime() - expected.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeLessThan(1);
  });
});

describe("Stripe webhook — Verlängerung zählt genau einmal (BUG-G5)", () => {
  const renewalEvent = () => ({
    type: "checkout.session.completed",
    data: {
      object: makeSession({
        id: "cs_renew_once",
        metadata: { product_type: "renewal", user_id: "user-1", project_id: "proj-1" },
        amount_total: 9900,
      }),
    },
  });

  it("a failed access write rolls the payment back, so the retry still extends once", async () => {
    const start = Date.now() + 10 * 24 * 60 * 60 * 1000;
    fakeDb.project_access.push({ project_id: "proj-1", expires_at: new Date(start).toISOString() });
    constructEventMock.mockReturnValue(renewalEvent());

    failNextAccessWrite = true;
    const first = await callPost("body", "valid-sig");
    expect(first.status).toBe(500);
    expect(fakeDb.payments).toHaveLength(0);
    expect(fakeDb.project_access[0].expires_at).toBe(new Date(start).toISOString());

    const retry = await callPost("body", "valid-sig");
    expect(retry.status).toBe(200);
    expect(fakeDb.payments).toHaveLength(1);
    expect(new Date(fakeDb.project_access[0].expires_at as string).getTime()).toBe(
      addTwelveMonths(start).getTime(),
    );
  });

  it("two parallel deliveries extend only once and send one confirmation", async () => {
    const start = Date.now() + 10 * 24 * 60 * 60 * 1000;
    fakeDb.project_access.push({ project_id: "proj-1", expires_at: new Date(start).toISOString() });
    constructEventMock.mockReturnValue(renewalEvent());

    const [a, b] = await Promise.all([callPost("body", "valid-sig"), callPost("body", "valid-sig")]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(fakeDb.payments).toHaveLength(1);
    expect(new Date(fakeDb.project_access[0].expires_at as string).getTime()).toBe(
      addTwelveMonths(start).getTime(),
    );
    expect(sendRenewalMailMock).toHaveBeenCalledTimes(1);
  });
});

describe("Stripe webhook — persönlicher Link in der Kauf-Mail (BUG-G12)", () => {
  it("schickt das Geheimnis nur in der Mail, in der Datenbank liegt der Hash", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: makeSession({
          id: "cs_guest_link",
          customer_details: { email: "gast@example.com" },
          metadata: {
            product_type: "initial",
            guest: "1",
            claim_hash: "a".repeat(64),
            full_name: "Gast",
            is_gift: "0",
          },
        }),
      },
    });
    await callPost("body", "valid-sig");

    const code = sendGuestPurchaseMailMock.mock.calls[0][0].claimCode as string;
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = fakeDb.purchase_claims[0];
    expect(row.mail_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.mail_token_hash).not.toBe(code);
    expect(JSON.stringify(row)).not.toContain(code);
  });
});

describe("Stripe webhook — Geschenk ohne eigenen Zugang und ohne Konto", () => {
  const directGift = (id = "cs_direct_gift") => ({
    type: "checkout.session.completed",
    data: {
      object: makeSession({
        id,
        customer_details: { email: "kaeufer@example.com" },
        metadata: {
          product_type: "initial",
          gift_direct: "1",
          full_name: "Karla Käufer",
          is_gift: "1",
          gift_mode: "phone-plus-computer",
          gift_recipient_name: "Oma Erna",
          gift_recipient_email: "Oma@Example.com",
          gift_recipient_role: "projektleiter",
          buyer_retains_access: "0",
        },
      }),
    },
  });

  it("richtet das Projekt sofort ein und verschickt das Geschenk", async () => {
    constructEventMock.mockReturnValue(directGift());
    const res = await callPost("body", "valid-sig");
    expect(await res.json()).toMatchObject({ processed: "direct_gift" });

    expect(fakeDb.projects).toHaveLength(1);
    expect(fakeDb.projects[0].owner_id).toBeNull();
    expect(fakeDb.project_members).toHaveLength(0);
    expect(fakeDb.project_access).toHaveLength(1);
    expect(fakeDb.purchase_claims).toHaveLength(0);
    expect(fakeDb.payments[0].user_id).toBeNull();
    expect(fakeDb.invitations[0]).toMatchObject({
      email: "oma@example.com",
      role: "projektleiter",
      is_gift: true,
      expires_at: fakeDb.project_access[0].expires_at,
    });

    expect(sendGuestPurchaseMailMock).not.toHaveBeenCalled();
    expect(sendInvitationMailMock.mock.calls[0][0]).toMatchObject({
      to: "Oma@Example.com",
      inviterName: "Karla Käufer",
      inviterEmail: "kaeufer@example.com",
      isGift: true,
    });
    expect(sendPortalPurchaseMailMock.mock.calls[0][0]).toMatchObject({
      to: "kaeufer@example.com",
      fullName: "Karla Käufer",
      buyerHasAccess: false,
      giftRecipientEmail: "Oma@Example.com",
    });
  });

  it("zweite Zustellung: kein zweites Projekt, keine zweite Mail", async () => {
    constructEventMock.mockReturnValue(directGift());
    await callPost("body", "valid-sig");
    const second = await callPost("body", "valid-sig");
    expect(await second.json()).toMatchObject({ duplicate: true });
    expect(fakeDb.projects).toHaveLength(1);
    expect(sendInvitationMailMock).toHaveBeenCalledTimes(1);
    expect(sendPortalPurchaseMailMock).toHaveBeenCalledTimes(1);
  });

  it("ein Mail-Fehler ändert nichts am erfüllten Kauf", async () => {
    sendInvitationMailMock.mockRejectedValueOnce(new Error("resend down"));
    constructEventMock.mockReturnValue(directGift());
    const res = await callPost("body", "valid-sig");
    expect(res.status).toBe(200);
    expect(fakeDb.payments).toHaveLength(1);
  });
});

describe("Stripe webhook — Zahlungsstatus (BUG-G2, BUG-G3)", () => {
  const initialMeta = { product_type: "initial", user_id: "user-1", full_name: "Test User", is_gift: "0" };

  it("fulfils a 100 % promotion code (no_payment_required, amount 0)", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: { ...makeSession({ payment_status: "no_payment_required", metadata: initialMeta }), amount_total: 0 },
      },
    });
    const res = await callPost("body", "valid-sig");
    expect(res.status).toBe(200);
    expect(fakeDb.projects).toHaveLength(1);
    expect(fakeDb.payments[0].amount_cents).toBe(0);
    expect(sendPortalPurchaseMailMock).toHaveBeenCalledTimes(1);
  });

  it("does not fulfil no_payment_required with an open amount", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: makeSession({ payment_status: "no_payment_required", metadata: initialMeta }) },
    });
    await callPost("body", "valid-sig");
    expect(fakeDb.projects).toHaveLength(0);
  });

  it("delayed payment: nothing on completed (unpaid), fulfilled on async_payment_succeeded", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: makeSession({ id: "cs_sepa", payment_status: "unpaid", metadata: initialMeta }) },
    });
    await callPost("body", "valid-sig");
    expect(fakeDb.projects).toHaveLength(0);
    expect(fakeDb.payments).toHaveLength(0);

    constructEventMock.mockReturnValue({
      type: "checkout.session.async_payment_succeeded",
      data: { object: makeSession({ id: "cs_sepa", payment_status: "paid", metadata: initialMeta }) },
    });
    const res = await callPost("body", "valid-sig");
    expect(res.status).toBe(200);
    expect(fakeDb.projects).toHaveLength(1);
    expect(fakeDb.payments).toHaveLength(1);
  });

  it("keeps the narration draft alive while a delayed payment is pending (PROJ-24)", async () => {
    markNarrationDraftMock.mockClear();
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: makeSession({
          id: "cs_sepa_draft",
          payment_status: "unpaid",
          metadata: { ...initialMeta, narration_draft: "draft-1" },
        }),
      },
    });
    const res = await callPost("body", "valid-sig");
    expect(res.status).toBe(200);
    expect(markNarrationDraftMock).toHaveBeenCalledWith("draft-1", "payment_pending");
    expect(fakeDb.projects).toHaveLength(0);
  });

  it("ignores a failed delayed payment", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.async_payment_failed",
      data: { object: makeSession({ id: "cs_sepa_fail", payment_status: "unpaid", metadata: initialMeta }) },
    });
    const res = await callPost("body", "valid-sig");
    expect(res.status).toBe(200);
    expect(fakeDb.projects).toHaveLength(0);
  });
});

describe("Stripe webhook — retired vapi product (PROJ-6-Rückbau)", () => {
  it("acknowledges with 200 and changes no state", async () => {
    const session = makeSession({
      metadata: {
        product_type: "vapi",
        user_id: "user-1",
        project_id: "proj-1",
      },
      amount_total: 1900,
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: session },
    });

    const res = await callPost("body", "valid-sig");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ignored).toBe("retired_product");

    expect(fakeDb.payments.length).toBe(0);
    expect(fakeDb.projects.length).toBe(0);
    expect(fakeDb.project_access.length).toBe(0);
    expect(fakeDb.project_members.length).toBe(0);
  });
});

// ─── Kauf ohne Konto (Checkout vor Login/Registrierung) ──────────────

describe("Stripe webhook — guest purchase (no account yet)", () => {
  const CLAIM_HASH = "a".repeat(64);

  function guestSession(meta: Record<string, string> = {}) {
    return makeSession({
      id: "cs_guest_1",
      customer_details: { email: "Gast@Example.com" },
      metadata: {
        product_type: "initial",
        guest: "1",
        claim_hash: CLAIM_HASH,
        full_name: "Gerda Gast",
        is_gift: "0",
        ...meta,
      },
    });
  }

  it("stores an open claim and asks the buyer to create an account — no project yet", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: guestSession() },
    });

    const res = await callPost("body", "valid-sig");
    expect(res.status).toBe(200);
    expect((await res.json()).processed).toBe("guest_initial");

    expect(fakeDb.purchase_claims).toHaveLength(1);
    expect(fakeDb.purchase_claims[0]).toMatchObject({
      stripe_session_id: "cs_guest_1",
      buyer_email: "gast@example.com",
      claim_token_hash: CLAIM_HASH,
      amount_cents: 24900,
    });
    // Ohne Konto entsteht weder Projekt noch Zugang noch Zahlungs-Eintrag.
    expect(fakeDb.projects).toHaveLength(0);
    expect(fakeDb.project_access).toHaveLength(0);
    expect(fakeDb.project_members).toHaveLength(0);
    expect(fakeDb.payments).toHaveLength(0);

    expect(sendGuestPurchaseMailMock).toHaveBeenCalledTimes(1);
    expect(sendGuestPurchaseMailMock.mock.calls[0][0]).toMatchObject({
      to: "Gast@Example.com",
      fullName: "Gerda Gast",
      isGift: false,
    });
    expect(sendPortalPurchaseMailMock).not.toHaveBeenCalled();
    expect(sendInvitationMailMock).not.toHaveBeenCalled();
  });

  it("gift purchase as guest: invitation is NOT sent before the account exists", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: guestSession({
          is_gift: "1",
          gift_mode: "phone-plus-computer",
          gift_recipient_email: "oma@example.com",
          buyer_retains_access: "1",
        }),
      },
    });

    await callPost("body", "valid-sig");
    expect(fakeDb.invitations).toHaveLength(0);
    expect(sendInvitationMailMock).not.toHaveBeenCalled();
    expect(sendGuestPurchaseMailMock.mock.calls[0][0]).toMatchObject({ isGift: true });
  });

  it("is idempotent: a repeated webhook neither duplicates the claim nor re-sends the mail", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: guestSession() },
    });
    await callPost("body", "valid-sig");
    const res = await callPost("body", "valid-sig");

    expect(res.status).toBe(200);
    expect((await res.json()).duplicate).toBe(true);
    expect(fakeDb.purchase_claims).toHaveLength(1);
    expect(sendGuestPurchaseMailMock).toHaveBeenCalledTimes(1);
  });

  it("rejects guest sessions without a valid claim hash (no state change, no retry loop)", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: guestSession({ claim_hash: "not-a-hash" }) },
    });
    const res = await callPost("body", "valid-sig");

    expect(res.status).toBe(200);
    expect((await res.json()).error).toBe("invalid_guest_metadata");
    expect(fakeDb.purchase_claims).toHaveLength(0);
    expect(sendGuestPurchaseMailMock).not.toHaveBeenCalled();
  });
});
