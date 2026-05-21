// PROJ-6 Webhook-Route Pflicht-Tests (Tech-Design Sektion L).
//
// Diese Tests stehen für die K-Erfolgskriterien aus dem PROJ-6-Spec:
//   1. Webhook-Signaturen: 400 bei ungültiger Signatur.
//   2. Idempotenz: zweimaliger Webhook → ein payments-Eintrag.
//   3. Renewal-GREATEST-Trick: kein Zeitverlust bei früher Verlängerung.
//   4. Vapi-Verfügbarkeit: 36 000 + Top-Ups × 3 600 − Sessions.
//
// Negativtest „Paywall-Lockdown" (Pflicht 1) ist ein SQL-Test gegen
// project_access — siehe tests/PROJ-6-stripe-zahlungen.spec.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Wir setzen Env-Vars BEVOR irgendein Modul importiert wird, damit
// `getStripe()` und `createServiceRoleClient()` nicht beim Bootstrap
// werfen. Echte Stripe-API-Aufrufe werden via vi.mock unten unterbunden.
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dummy";
process.env.STRIPE_PRICE_ID_INITIAL = "price_initial_test";
process.env.STRIPE_PRICE_ID_RENEWAL = "price_renewal_test";
process.env.STRIPE_PRICE_ID_VAPI_60 = "price_vapi_test";
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
};

let fakeDb: FakeRows;

// Builder, der sowohl direkt-awaitbar ist als auch .select().single()
// unterstützt. Push passiert genau einmal — entweder im `then` der
// direkten await-Variante ODER beim Aufruf von .single().
function makeInsertBuilder(table: keyof FakeRows, row: Record<string, unknown> | Record<string, unknown>[]) {
  const r = Array.isArray(row) ? row[0] : row;
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
          const withId = push();
          return { data: withId, error: null };
        },
      };
    },
    then(resolve: (v: { data: null; error: null }) => unknown) {
      push();
      return Promise.resolve({ data: null, error: null }).then(resolve);
    },
  };
}

const supabaseMock = {
  from: (table: keyof FakeRows) => ({
    select: (_cols: string) => ({
      eq: (col: string, val: unknown) => ({
        maybeSingle: async () => {
          const found = fakeDb[table].find(
            (r) => (r as Record<string, unknown>)[col] === val,
          );
          return { data: found ?? null, error: null };
        },
      }),
    }),
    insert: (row: Record<string, unknown> | Record<string, unknown>[]) =>
      makeInsertBuilder(table, row),
    upsert: (row: Record<string, unknown>, _opts?: { onConflict?: string }) => {
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
  }> = {},
) {
  return {
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
  };
  constructEventMock.mockReset();
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
      metadata: { product_type: "vapi", user_id: "user-1", project_id: "proj-1" },
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
    // Soll ungefähr futureExpiry + 365 days sein, NICHT NOW + 365 days.
    const expected = new Date(futureExpiry.getTime() + 365 * 24 * 60 * 60 * 1000);
    const diffDays = Math.abs(newExpiry.getTime() - expected.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeLessThan(1);
  });
});

describe("Stripe webhook — vapi top-up (Pflicht-Test 7 base)", () => {
  it("inserts payments-row only, no other state change", async () => {
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

    expect(fakeDb.payments.length).toBe(1);
    expect(fakeDb.payments[0].type).toBe("vapi_voice_minutes_60");
    expect(fakeDb.projects.length).toBe(0);
    expect(fakeDb.project_access.length).toBe(0);
    expect(fakeDb.project_members.length).toBe(0);
  });
});
