// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn();
const resend = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword, resend } }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));
vi.mock("@/lib/purchases/pending-claim", () => ({
  hasPendingClaim: vi.fn(async () => false),
  isDefaultLandingTarget: () => true,
}));
vi.mock("@/lib/auth/account-exists", () => ({ accountExists: vi.fn() }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  getRequestIp: vi.fn(async () => "203.0.113.7"),
  hitRateLimits: vi.fn(),
  undoRateLimits: vi.fn(async () => undefined),
  clearRateLimit: vi.fn(async () => undefined),
}));

import { accountExists } from "@/lib/auth/account-exists";
import { CAPTCHA_FAILED_MESSAGE } from "@/lib/captcha";
import {
  RATE_LIMITS,
  RATE_LIMIT_MESSAGES,
  clearRateLimit,
  hitRateLimits,
  undoRateLimits,
} from "@/lib/rate-limit";
import { loginAction, resendConfirmAction } from "./actions";

const ipCheck = { rule: RATE_LIMITS.loginIp, identifier: "203.0.113.7" };
const accountCheck = { rule: RATE_LIMITS.loginAccount, identifier: "maria@example.test" };

function loginForm(extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set("email", "maria@example.test");
  form.set("password", "geheim-123");
  form.set("next", "/");
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

function resendForm(token?: string) {
  const form = new FormData();
  form.set("email", "maria@example.test");
  if (token) form.set("cf-turnstile-response", token);
  return form;
}

beforeEach(() => {
  signInWithPassword.mockReset().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  resend.mockReset().mockResolvedValue({ error: null });
  vi.mocked(hitRateLimits).mockReset().mockResolvedValue({ allowed: true, unavailable: false });
  vi.mocked(undoRateLimits).mockClear();
  vi.mocked(clearRateLimit).mockClear();
  vi.mocked(accountExists).mockReset().mockResolvedValue(true);
});

describe("loginAction — Rate-Limit", () => {
  it("does not count an incomplete form", async () => {
    const res = await loginAction({}, loginForm({ email: "keine-adresse" }));
    expect(res.fieldErrors?.email).toBeDefined();
    expect(hitRateLimits).not.toHaveBeenCalled();
  });

  it("checks the IP first, then the account", async () => {
    await expect(loginAction({}, loginForm())).rejects.toThrow("REDIRECT:/");
    expect(hitRateLimits).toHaveBeenCalledWith([ipCheck, accountCheck]);
  });

  it("blocks before calling Supabase", async () => {
    vi.mocked(hitRateLimits).mockResolvedValue({ allowed: false, unavailable: false });
    const res = await loginAction({}, loginForm());
    expect(res.error).toBe(RATE_LIMIT_MESSAGES.login);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("fails closed when the counters are unavailable", async () => {
    vi.mocked(hitRateLimits).mockResolvedValue({ allowed: false, unavailable: true });
    const res = await loginAction({}, loginForm());
    expect(res.error).toBe(RATE_LIMIT_MESSAGES.unavailable);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("keeps the count after a wrong password", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials" },
    });
    const res = await loginAction({}, loginForm());
    expect(res.error).toBe("Das Passwort stimmt leider nicht.");
    expect(undoRateLimits).not.toHaveBeenCalled();
  });

  it("says when the address has no account and keeps the count", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials" },
    });
    vi.mocked(accountExists).mockResolvedValue(false);
    const res = await loginAction({}, loginForm());
    expect(res.error).toBe("Zu dieser E-Mail gibt es noch kein Konto.");
    expect(accountExists).toHaveBeenCalledWith("maria@example.test");
    expect(undoRateLimits).not.toHaveBeenCalled();
  });

  it("stays neutral when the account lookup fails", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials" },
    });
    vi.mocked(accountExists).mockResolvedValue(null);
    const res = await loginAction({}, loginForm());
    expect(res.error).toBe("E-Mail oder Passwort falsch.");
  });

  it("does not look up the address above the limit", async () => {
    vi.mocked(hitRateLimits).mockResolvedValue({ allowed: false, unavailable: false });
    await loginAction({}, loginForm());
    expect(accountExists).not.toHaveBeenCalled();
  });

  it("does not count a failed security check as a wrong password", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: { code: "captcha_failed" } });
    const res = await loginAction({}, loginForm());
    expect(res.error).toBe(CAPTCHA_FAILED_MESSAGE);
    expect(undoRateLimits).toHaveBeenCalledWith([ipCheck, accountCheck]);
    expect(accountExists).not.toHaveBeenCalled();
  });

  it("asks to confirm the address without counting the attempt", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "email_not_confirmed" },
    });
    const res = await loginAction({}, loginForm());
    expect(res.error).toBe("Bitte bestätigen Sie zuerst Ihre E-Mail.");
    expect(undoRateLimits).toHaveBeenCalledWith([ipCheck, accountCheck]);
  });

  it("does not blame the password for a technical error", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "over_request_rate_limit" },
    });
    const res = await loginAction({}, loginForm());
    expect(res.error).toBe(RATE_LIMIT_MESSAGES.unavailable);
    expect(undoRateLimits).toHaveBeenCalledWith([ipCheck, accountCheck]);
  });

  it("treats a network error without code as technical", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "fetch failed" } });
    const res = await loginAction({}, loginForm());
    expect(res.error).toBe(RATE_LIMIT_MESSAGES.unavailable);
  });

  it("after success takes back only this attempt for the IP and clears the account", async () => {
    await expect(loginAction({}, loginForm())).rejects.toThrow("REDIRECT:/");
    expect(undoRateLimits).toHaveBeenCalledWith([ipCheck]);
    expect(clearRateLimit).toHaveBeenCalledWith(accountCheck);
    expect(clearRateLimit).not.toHaveBeenCalledWith(ipCheck);
  });

  it("passes the security token to Supabase", async () => {
    await expect(
      loginAction({}, loginForm({ "cf-turnstile-response": "token-1" })),
    ).rejects.toThrow("REDIRECT:/");
    expect(signInWithPassword.mock.calls[0][0].options).toEqual({ captchaToken: "token-1" });
  });
});

describe("resendConfirmAction — Rate-Limit", () => {
  it("answers like a success but sends nothing above the limit", async () => {
    vi.mocked(hitRateLimits).mockResolvedValue({ allowed: false, unavailable: false });
    await expect(resendConfirmAction({}, resendForm())).resolves.toEqual({ success: true });
    expect(resend).not.toHaveBeenCalled();
  });

  it("limits by IP and address", async () => {
    await resendConfirmAction({}, resendForm());
    expect(hitRateLimits).toHaveBeenCalledWith([
      { rule: RATE_LIMITS.resendIp, identifier: "203.0.113.7" },
      { rule: RATE_LIMITS.resendEmail, identifier: "maria@example.test" },
    ]);
  });

  it("passes the token and reports a failed security check", async () => {
    resend.mockResolvedValue({ error: { code: "captcha_failed" } });
    const res = await resendConfirmAction({}, resendForm("token-2"));
    expect(res.error).toBe(CAPTCHA_FAILED_MESSAGE);
    expect(resend.mock.calls[0][0].options.captchaToken).toBe("token-2");
  });

  it("takes back only the address after a failed security check", async () => {
    resend.mockResolvedValue({ error: { code: "captcha_failed" } });
    await resendConfirmAction({}, resendForm());
    expect(undoRateLimits).toHaveBeenCalledTimes(1);
    expect(undoRateLimits).toHaveBeenCalledWith([
      { rule: RATE_LIMITS.resendEmail, identifier: "maria@example.test" },
    ]);
  });

  it("keeps the count when a mail was requested", async () => {
    await resendConfirmAction({}, resendForm("token-2"));
    expect(undoRateLimits).not.toHaveBeenCalled();
  });

  it("does not reveal other errors", async () => {
    resend.mockResolvedValue({ error: { code: "user_not_found" } });
    await expect(resendConfirmAction({}, resendForm())).resolves.toEqual({ success: true });
  });
});
