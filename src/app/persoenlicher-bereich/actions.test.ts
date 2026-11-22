import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
let profileDeleteError: { message: string } | null = null;
const resetPasswordForEmail = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1", email: "maria@example.test" } } }),
      resetPasswordForEmail,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: async () => ({ data: [] }),
        }),
      }),
    }),
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { full_name: "Maria Muster" } }),
        }),
      }),
      delete: () => ({
        eq: async () => {
          calls.push("profile");
          return { error: profileDeleteError };
        },
      }),
    }),
    auth: {
      admin: {
        deleteUser: async () => {
          calls.push("auth");
          return { error: null };
        },
      },
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/email/retry-queue", () => ({
  removeQueuedMailsOfAccount: vi.fn(async () => {
    calls.push("queue");
  }),
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  hitRateLimits: vi.fn(),
  undoRateLimits: vi.fn(async () => undefined),
}));

import { CAPTCHA_FAILED_MESSAGE } from "@/lib/captcha";
import { removeQueuedMailsOfAccount } from "@/lib/email/retry-queue";
import { RATE_LIMITS, hitRateLimits, undoRateLimits } from "@/lib/rate-limit";
import { deleteAccountAction, resetPasswordAction } from "./actions";

beforeEach(() => {
  calls.length = 0;
  profileDeleteError = null;
  resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  vi.mocked(hitRateLimits).mockReset().mockResolvedValue({ allowed: true, unavailable: false });
  vi.mocked(undoRateLimits).mockClear();
  vi.mocked(removeQueuedMailsOfAccount).mockClear();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-dummy";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("deleteAccountAction — Mail-Warteschlange (BUG-20)", () => {
  it("cleans the queue with email and name after the profile is gone", async () => {
    await expect(deleteAccountAction({}, new FormData())).rejects.toThrow("NEXT_REDIRECT");

    expect(calls).toEqual(["profile", "queue", "auth"]);
    expect(removeQueuedMailsOfAccount).toHaveBeenCalledWith({
      email: "maria@example.test",
      fullName: "Maria Muster",
    });
  });

  it("leaves the queue alone when the profile could not be deleted", async () => {
    profileDeleteError = { message: "boom" };

    const result = await deleteAccountAction({}, new FormData());

    expect(result.error).toBeDefined();
    expect(removeQueuedMailsOfAccount).not.toHaveBeenCalled();
  });
});

describe("resetPasswordAction — Rate-Limit", () => {
  it("does not use up an attempt when the security check fails", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { code: "captcha_failed" } });

    const result = await resetPasswordAction({}, new FormData());

    expect(result.error).toBe(CAPTCHA_FAILED_MESSAGE);
    expect(undoRateLimits).toHaveBeenCalledWith([
      { rule: RATE_LIMITS.accountReset, identifier: "user-1" },
    ]);
  });

  it("keeps the count when a mail was requested", async () => {
    await expect(resetPasswordAction({}, new FormData())).resolves.toEqual({ success: true });
    expect(undoRateLimits).not.toHaveBeenCalled();
  });
});
