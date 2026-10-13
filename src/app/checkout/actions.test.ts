import { describe, it, expect, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { startCheckoutAction, type StartCheckoutInput } from "./actions";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const sessionsCreateMock = vi.fn();
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({ checkout: { sessions: { create: sessionsCreateMock } } }),
  getPriceId: () => "price_test",
  getSiteUrl: () => "http://localhost:3000",
}));

function mockUser(user: { id: string; email: string } | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user } }) },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

beforeEach(() => {
  sessionsCreateMock.mockReset();
});

describe("startCheckoutAction — PROJ-6-Rückbau", () => {
  it("rejects unauthenticated callers", async () => {
    mockUser(null);
    const res = await startCheckoutAction({
      productType: "renewal",
      projectId: "proj-1",
    });
    expect(res).toEqual({ ok: false, error: "Nicht eingeloggt." });
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("rejects the retired vapi product without creating a Stripe session", async () => {
    mockUser({ id: "user-1", email: "user@example.com" });
    // Server-Actions sind von außen aufrufbar — der alte Produkt-Typ kann
    // trotz TypeScript-Typ zur Laufzeit ankommen.
    const input = {
      productType: "vapi",
      projectId: "proj-1",
    } as unknown as StartCheckoutInput;
    const res = await startCheckoutAction(input);
    expect(res.ok).toBe(false);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });
});
