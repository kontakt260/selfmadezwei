import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  user: { id: "u1", email: "a@example.com", email_confirmed_at: "2026-01-01" } as Record<string, unknown> | null,
  hasProject: true,
  cookies: {} as Record<string, string>,
  outcome: { claimed: [], failed: 0, cookieSpent: false, mailLinkUnavailable: false } as Record<string, unknown>,
  claimInput: null as Record<string, unknown> | null,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies[name] ? { value: state.cookies[name] } : undefined),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({
        limit: async () => ({ data: state.hasProject ? [{ project_id: "p1" }] : [], error: null }),
      }),
    }),
  }),
}));
vi.mock("@/lib/supabase/serviceRole", () => ({ createServiceRoleClient: () => ({}) }));
vi.mock("@/lib/stripe/server", () => ({ getStripe: () => ({}) }));
vi.mock("@/lib/purchases/guest-purchase", () => ({
  claimGuestPurchases: async (_db: unknown, input: Record<string, unknown>) => {
    state.claimInput = input;
    if (state.outcome.throws) throw new Error("db down");
    return state.outcome;
  },
}));

import { GET } from "./route";
import { CLAIM_LINK_COOKIE } from "@/lib/purchases/claim-token";

const call = () => GET(new NextRequest("https://app.test/kauf-einloesen"));
const code = "a".repeat(43);

beforeEach(() => {
  state.user = { id: "u1", email: "a@example.com", email_confirmed_at: "2026-01-01" };
  state.hasProject = true;
  state.cookies = { [CLAIM_LINK_COOKIE]: code };
  state.outcome = { claimed: [], failed: 0, cookieSpent: false, mailLinkUnavailable: false };
  state.claimInput = null;
});

describe("/kauf-einloesen mit Link aus der Kauf-Mail", () => {
  it("gibt das Geheimnis weiter und löscht das Cookie nach dem Einlösen", async () => {
    state.outcome.claimed = [{ stripeSessionId: "cs_test_1", projectId: "p2" }];
    const res = await call();
    expect(state.claimInput?.mailToken).toBe(code);
    expect(res.headers.get("location")).toBe("https://app.test/kauf-erfolgreich?session_id=cs_test_1");
    expect(res.cookies.get(CLAIM_LINK_COOKIE)?.value).toBe("");
  });

  it("verbrauchter Link: Hinweis statt wortloser Startseite", async () => {
    state.outcome.mailLinkUnavailable = true;
    const res = await call();
    expect(res.headers.get("location")).toBe("https://app.test/?kauf=link-verbraucht");
    expect(res.cookies.get(CLAIM_LINK_COOKIE)?.value).toBe("");
  });

  it("verbrauchter Link ohne Projekt: Hinweis im Kauf-Assistenten", async () => {
    state.hasProject = false;
    state.outcome.mailLinkUnavailable = true;
    const res = await call();
    expect(res.headers.get("location")).toBe("https://app.test/onboarding?kauf=link-verbraucht");
  });

  it("technischer Fehler: Cookie bleibt für den nächsten Versuch", async () => {
    state.hasProject = false;
    state.outcome.throws = true;
    const res = await call();
    expect(res.headers.get("location")).toBe("https://app.test/onboarding?kauf=nicht-zugeordnet");
    expect(res.cookies.get(CLAIM_LINK_COOKIE)).toBeUndefined();
  });

  it("nicht angemeldet: zur Anmeldung, Cookie bleibt", async () => {
    state.user = null;
    const res = await call();
    expect(res.headers.get("location")).toBe("https://app.test/anmelden?next=%2Fkauf-einloesen");
    expect(res.cookies.get(CLAIM_LINK_COOKIE)).toBeUndefined();
    expect(state.claimInput).toBeNull();
  });
});
