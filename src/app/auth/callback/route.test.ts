import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { maybeSendWelcomeMail } from "@/lib/email/send-welcome";
import { GET } from "./route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/email/send-welcome", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send-welcome")>()),
  maybeSendWelcomeMail: vi.fn(async () => undefined),
}));

const ORIGIN = "https://app.example.test";

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();

function mockSupabase() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { verifyOtp, exchangeCodeForSession, getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { full_name: "Maria Muster" } }),
        }),
      }),
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function call(query: string) {
  return GET(new NextRequest(`${ORIGIN}/auth/callback?${query}`));
}

beforeEach(() => {
  verifyOtp.mockReset().mockResolvedValue({ error: null });
  exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  getUser.mockReset().mockResolvedValue({
    data: {
      user: {
        id: "user-1",
        email: "maria@example.test",
        email_confirmed_at: "2026-10-14T00:00:00Z",
        created_at: new Date().toISOString(),
      },
    },
  });
  vi.mocked(maybeSendWelcomeMail).mockClear();
  mockSupabase();
});

describe("/auth/callback — Mail-Link mit Token-Hash", () => {
  it("confirms a signup link server-side and redirects to next", async () => {
    const res = await call("next=%2Fonboarding&token_hash=pkce_abc&type=email");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "pkce_abc" });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(`${ORIGIN}/onboarding`);
    expect(maybeSendWelcomeMail).toHaveBeenCalledWith({
      to: "maria@example.test",
      userId: "user-1",
      fullName: "Maria Muster",
    });
  });

  it("confirms a recovery link and redirects to the reset form", async () => {
    const res = await call("next=/passwort-zuruecksetzen&token_hash=pkce_abc&type=recovery");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "pkce_abc" });
    expect(res.headers.get("location")).toBe(`${ORIGIN}/passwort-zuruecksetzen`);
  });

  it("offers a new reset link when a recovery token is invalid or used", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Email link is invalid or has expired" } });
    const res = await call("next=/passwort-zuruecksetzen&token_hash=used&type=recovery");
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/anmelden?error=expired_link&flow=recovery`,
    );
    expect(maybeSendWelcomeMail).not.toHaveBeenCalled();
  });

  it("rejects unknown link types without calling Supabase", async () => {
    const res = await call("next=/onboarding&token_hash=abc&type=sms");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(`${ORIGIN}/anmelden?error=expired_link`);
  });

  it("never redirects to a foreign site via next", async () => {
    const res = await call("next=%2F%2Fevil.example&token_hash=pkce_abc&type=email");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/`);
  });
});

describe("/auth/callback — Code-Weg (OAuth, ältere Links)", () => {
  it("still exchanges the code and redirects to next", async () => {
    const res = await call("next=%2F&code=oauth-code");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("oauth-code");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(`${ORIGIN}/`);
  });

  it("points a failed reset link (other browser) to a new reset link", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "code verifier missing" } });
    const res = await call("next=/passwort-zuruecksetzen&code=abc");
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/anmelden?error=expired_link&flow=recovery`,
    );
  });

  it("keeps the confirmation-resend banner for failed signup links", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid" } });
    const res = await call("next=%2Fonboarding&code=abc");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/anmelden?error=expired_link`);
  });

  it("does not send a welcome mail to unconfirmed accounts", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-2", email: "neu@example.test", email_confirmed_at: null } },
    });
    await call("next=%2F&code=oauth-code");
    expect(maybeSendWelcomeMail).not.toHaveBeenCalled();
  });

  it("does not welcome existing accounts (e.g. password reset months later)", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-3",
          email: "alt@example.test",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      },
    });
    const res = await call("next=/passwort-zuruecksetzen&token_hash=pkce_abc&type=recovery");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/passwort-zuruecksetzen`);
    expect(maybeSendWelcomeMail).not.toHaveBeenCalled();
  });

  it("redirects to the login page when neither code nor token is present", async () => {
    const res = await call("next=%2Fonboarding");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/anmelden?error=expired_link`);
  });
});
