// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const resetPasswordForEmail = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { resetPasswordForEmail } }),
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  getRequestIp: vi.fn(async () => "203.0.113.7"),
  hitRateLimits: vi.fn(),
  undoRateLimits: vi.fn(async () => undefined),
}));

import { CAPTCHA_FAILED_MESSAGE } from "@/lib/captcha";
import {
  RATE_LIMITS,
  RATE_LIMIT_MESSAGES,
  hitRateLimits,
  undoRateLimits,
} from "@/lib/rate-limit";
import { forgotPasswordAction } from "./actions";

function form(token?: string) {
  const data = new FormData();
  data.set("email", "maria@example.test");
  if (token) data.set("cf-turnstile-response", token);
  return data;
}

beforeEach(() => {
  resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  vi.mocked(hitRateLimits).mockReset().mockResolvedValue({ allowed: true, unavailable: false });
  vi.mocked(undoRateLimits).mockClear();
});

describe("forgotPasswordAction — Rate-Limit", () => {
  it("limits by IP and address", async () => {
    await forgotPasswordAction({}, form());
    expect(hitRateLimits).toHaveBeenCalledWith([
      { rule: RATE_LIMITS.resetIp, identifier: "203.0.113.7" },
      { rule: RATE_LIMITS.resetEmail, identifier: "maria@example.test" },
    ]);
  });

  it("answers like a success but sends nothing above the limit", async () => {
    vi.mocked(hitRateLimits).mockResolvedValue({ allowed: false, unavailable: false });
    await expect(forgotPasswordAction({}, form())).resolves.toEqual({ success: true });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("fails closed when the counters are unavailable", async () => {
    vi.mocked(hitRateLimits).mockResolvedValue({ allowed: false, unavailable: true });
    const res = await forgotPasswordAction({}, form());
    expect(res.error).toBe(RATE_LIMIT_MESSAGES.unavailable);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("passes the token and reports a failed security check", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { code: "captcha_failed" } });
    const res = await forgotPasswordAction({}, form("token-3"));
    expect(res.error).toBe(CAPTCHA_FAILED_MESSAGE);
    expect(resetPasswordForEmail.mock.calls[0][1].captchaToken).toBe("token-3");
  });

  it("takes back only the address after a failed security check", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { code: "captcha_failed" } });
    await forgotPasswordAction({}, form());
    expect(undoRateLimits).toHaveBeenCalledTimes(1);
    expect(undoRateLimits).toHaveBeenCalledWith([
      { rule: RATE_LIMITS.resetEmail, identifier: "maria@example.test" },
    ]);
  });

  it("keeps the count when a mail was requested", async () => {
    await forgotPasswordAction({}, form("token-3"));
    expect(undoRateLimits).not.toHaveBeenCalled();
  });

  it("does not reveal whether the address exists", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { code: "user_not_found" } });
    await expect(forgotPasswordAction({}, form())).resolves.toEqual({ success: true });
  });
});
