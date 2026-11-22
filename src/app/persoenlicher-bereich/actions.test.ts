import { describe, it, expect, vi, beforeEach } from "vitest";

const PROJECT_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const SUCCESSOR = "22222222-2222-4222-a222-222222222222";

const calls: string[] = [];
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
let prepareResponse: { data: unknown; error: { message: string } | null };
let overviewResponse: { data: unknown; error: { message: string } | null };
let authDeleteError: { message: string } | null = null;
let currentUser: { id: string; email: string } | null = null;
const resetPasswordForEmail = vi.fn();
const signOut = vi.fn(async () => {
  calls.push("signOut");
  return { error: null };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: currentUser } }),
      resetPasswordForEmail,
      signOut,
    },
  }),
}));
vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      calls.push(name);
      return name === "prepare_account_deletion" ? prepareResponse : overviewResponse;
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { full_name: "Maria Muster" } }),
        }),
      }),
    }),
    auth: {
      admin: {
        deleteUser: async () => {
          calls.push("auth");
          return { error: authDeleteError };
        },
      },
    },
  }),
}));
vi.mock("@/lib/email/send-project-handover", () => ({
  notifyProjectHandover: vi.fn(),
}));
vi.mock("@/lib/email/background", () => ({
  sendInBackground: vi.fn((_label: string, task: () => Promise<unknown>) => {
    void task();
  }),
}));
vi.mock("@/lib/projects/storage-cleanup", () => ({
  processStorageCleanup: vi.fn(async () => ({ processed: 1, cleaned: 1, failed: 0 })),
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
import { notifyProjectHandover } from "@/lib/email/send-project-handover";
import { processStorageCleanup } from "@/lib/projects/storage-cleanup";
import { RATE_LIMITS, hitRateLimits, undoRateLimits } from "@/lib/rate-limit";
import {
  deleteAccountAction,
  getAccountDeletionOverviewAction,
  resetPasswordAction,
} from "./actions";

function deleteForm(
  overrides: { confirmation?: string; confirmedDelete?: string; successors?: string } = {},
): FormData {
  const form = new FormData();
  form.set("confirmation", overrides.confirmation ?? "LÖSCHEN");
  form.set("confirmedDelete", overrides.confirmedDelete ?? JSON.stringify([PROJECT_A]));
  form.set("successors", overrides.successors ?? JSON.stringify({ [PROJECT_B]: SUCCESSOR }));
  return form;
}

const handover = {
  projectId: PROJECT_B,
  title: "Omas Lebensbuch",
  to: "lena@example.test",
  fullName: "Lena Muster",
};

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  currentUser = { id: "user-1", email: "maria@example.test" };
  authDeleteError = null;
  prepareResponse = {
    data: { deletedProjectIds: [PROJECT_A], handovers: [handover] },
    error: null,
  };
  overviewResponse = { data: { delete: [], keep: [], otherCount: 0 }, error: null };
  resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  signOut.mockClear();
  vi.mocked(notifyProjectHandover).mockClear();
  vi.mocked(processStorageCleanup).mockClear();
  vi.mocked(hitRateLimits).mockReset().mockResolvedValue({ allowed: true, unavailable: false });
  vi.mocked(undoRateLimits).mockClear();
  vi.mocked(removeQueuedMailsOfAccount).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("deleteAccountAction", () => {
  it("prepares first, then deletes the account, the queue and the session", async () => {
    await expect(deleteAccountAction({}, deleteForm())).rejects.toThrow("NEXT_REDIRECT");

    expect(calls).toEqual(["prepare_account_deletion", "auth", "queue", "signOut"]);
    expect(removeQueuedMailsOfAccount).toHaveBeenCalledWith({
      email: "maria@example.test",
      fullName: "Maria Muster",
    });
  });

  it("takes the person from the session and passes the confirmed choices", async () => {
    await expect(deleteAccountAction({}, deleteForm())).rejects.toThrow("NEXT_REDIRECT");

    expect(rpcCalls[0]).toEqual({
      name: "prepare_account_deletion",
      args: {
        p_user_id: "user-1",
        p_email: "maria@example.test",
        p_confirmed_delete: [PROJECT_A],
        p_successors: { [PROJECT_B]: SUCCESSOR },
      },
    });
  });

  it("informs the successor and removes the files of deleted projects", async () => {
    await expect(deleteAccountAction({}, deleteForm())).rejects.toThrow("NEXT_REDIRECT");

    expect(vi.mocked(notifyProjectHandover).mock.calls[0][0]).toEqual(handover);
    expect(processStorageCleanup).toHaveBeenCalledWith([PROJECT_A]);
  });

  it("deletes nothing without the typed confirmation", async () => {
    const result = await deleteAccountAction({}, deleteForm({ confirmation: "loeschen" }));

    expect(result.error).toBeDefined();
    expect(calls).toEqual([]);
  });

  it("deletes nothing when the form data is manipulated", async () => {
    const result = await deleteAccountAction({}, deleteForm({ confirmedDelete: '["kein-uuid"]' }));

    expect(result.error).toBeDefined();
    expect(calls).toEqual([]);
  });

  it("deletes nothing when nobody is logged in", async () => {
    currentUser = null;

    const result = await deleteAccountAction({}, deleteForm());

    expect(result.error).toBe("Nicht angemeldet.");
    expect(calls).toEqual([]);
  });

  it.each(["overview_changed", "successor_required"])(
    "keeps the account and asks to review the overview on %s",
    async (message) => {
      prepareResponse = { data: null, error: { message } };

      const result = await deleteAccountAction({}, deleteForm());

      expect(result.overviewChanged).toBe(true);
      expect(calls).toEqual(["prepare_account_deletion"]);
      expect(removeQueuedMailsOfAccount).not.toHaveBeenCalled();
    },
  );

  it("keeps the account when the preparation fails", async () => {
    prepareResponse = { data: null, error: { message: "boom" } };

    const result = await deleteAccountAction({}, deleteForm());

    expect(result.error).toContain("nicht gelöscht");
    expect(calls).toEqual(["prepare_account_deletion"]);
  });

  it("can be repeated when deleting the account itself fails", async () => {
    authDeleteError = { message: "boom" };

    const result = await deleteAccountAction({}, deleteForm());

    expect(result.error).toContain("erneut");
    expect(result.overviewChanged).toBe(true);
    expect(removeQueuedMailsOfAccount).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("getAccountDeletionOverviewAction", () => {
  it("returns the overview for the person in the session", async () => {
    const overview = {
      delete: [{ projectId: PROJECT_A, title: "Mein Buch" }],
      keep: [],
      otherCount: 1,
    };
    overviewResponse = { data: overview, error: null };

    await expect(getAccountDeletionOverviewAction()).resolves.toEqual({
      overview,
      account: { fullName: "Maria Muster", email: "maria@example.test" },
    });
    expect(rpcCalls[0].args).toEqual({ p_user_id: "user-1", p_email: "maria@example.test" });
  });

  it("reports an error instead of an empty overview", async () => {
    overviewResponse = { data: null, error: { message: "boom" } };

    const result = await getAccountDeletionOverviewAction();

    expect(result.overview).toBeUndefined();
    expect(result.error).toBeDefined();
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
