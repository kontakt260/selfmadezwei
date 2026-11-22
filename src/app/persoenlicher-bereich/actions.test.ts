import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
let profileDeleteError: { message: string } | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1", email: "maria@example.test" } } }),
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

import { removeQueuedMailsOfAccount } from "@/lib/email/retry-queue";
import { deleteAccountAction } from "./actions";

beforeEach(() => {
  calls.length = 0;
  profileDeleteError = null;
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
