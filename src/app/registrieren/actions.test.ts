// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp } }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  getRequestIp: vi.fn(async () => "203.0.113.7"),
  hitRateLimits: vi.fn(),
}));

import { CAPTCHA_FAILED_MESSAGE } from "@/lib/captcha";
import { RATE_LIMITS, RATE_LIMIT_MESSAGES, hitRateLimits } from "@/lib/rate-limit";
import { registerAction } from "./actions";

function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  data.set("fullName", "Maria Muster");
  data.set("email", "maria@example.test");
  data.set("password", "geheim-123");
  data.set("confirmPassword", "geheim-123");
  data.set("onboardingIntent", "");
  data.set("next", "");
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
}

beforeEach(() => {
  signUp.mockReset().mockResolvedValue({
    data: { user: { id: "user-1", identities: [{ id: "identity-1" }] } },
    error: null,
  });
  vi.mocked(hitRateLimits).mockReset().mockResolvedValue({ allowed: true, unavailable: false });
});

describe("registerAction — Rate-Limit", () => {
  it("does not count an invalid form", async () => {
    const res = await registerAction({}, form({ confirmPassword: "anders" }));
    expect(res.fieldErrors?.confirmPassword).toBeDefined();
    expect(hitRateLimits).not.toHaveBeenCalled();
  });

  it("limits by IP", async () => {
    await expect(registerAction({}, form())).rejects.toThrow("REDIRECT:/email-bestaetigen");
    expect(hitRateLimits).toHaveBeenCalledWith([
      { rule: RATE_LIMITS.register, identifier: "203.0.113.7" },
    ]);
  });

  it("blocks before calling Supabase", async () => {
    vi.mocked(hitRateLimits).mockResolvedValue({ allowed: false, unavailable: false });
    const res = await registerAction({}, form());
    expect(res.error).toBe(RATE_LIMIT_MESSAGES.register);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("fails closed when the counters are unavailable", async () => {
    vi.mocked(hitRateLimits).mockResolvedValue({ allowed: false, unavailable: true });
    const res = await registerAction({}, form());
    expect(res.error).toBe(RATE_LIMIT_MESSAGES.unavailable);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("passes the token and reports a failed security check", async () => {
    signUp.mockResolvedValue({ data: { user: null }, error: { code: "captcha_failed" } });
    const res = await registerAction({}, form({ "cf-turnstile-response": "token-4" }));
    expect(res.error).toBe(CAPTCHA_FAILED_MESSAGE);
    expect(signUp.mock.calls[0][0].options.captchaToken).toBe("token-4");
  });
});
