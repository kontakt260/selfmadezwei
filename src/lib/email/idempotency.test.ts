import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-dummy";

// Service-Role-Client-Mock-State.
const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
const updateCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
let nextInsertResult: {
  data: { id: string } | null;
  error: { code?: string; message?: string } | null;
} = { data: { id: "log-1" }, error: null };

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        insertCalls.push({ table, payload });
        return {
          select: () => ({
            single: () => Promise.resolve(nextInsertResult),
          }),
        };
      },
      update: (payload: Record<string, unknown>) => ({
        eq: () => {
          updateCalls.push({ table, payload });
          return Promise.resolve({ data: null, error: null });
        },
      }),
      delete: () => {
        const filters: Array<[string, string, unknown]> = [];
        deleteCalls.push({ table, filters });
        const chain = {
          eq: (col: string, val: unknown) => {
            filters.push(["eq", col, val]);
            return chain;
          },
          lt: (col: string, val: unknown) => {
            filters.push(["lt", col, val]);
            return chain;
          },
          select: () => Promise.resolve(nextDeleteResult),
          then: (cb: (v: { error: null }) => unknown) =>
            Promise.resolve(cb({ error: null })),
        };
        return chain;
      },
    }),
  }),
}));

const deleteCalls: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];
let nextDeleteResult: { data: Array<{ id: string }> | null; error: { message: string } | null } = {
  data: [],
  error: null,
};

import {
  reserveMailLog,
  finalizeMailLog,
  releaseMailLog,
  deleteStaleMailLog,
} from "./idempotency";

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  nextInsertResult = { data: { id: "log-1" }, error: null };
  nextDeleteResult = { data: [], error: null };
});

describe("releaseMailLog", () => {
  it("deletes the marker by id", async () => {
    await releaseMailLog("log-7");
    expect(deleteCalls).toEqual([{ table: "mail_log", filters: [["eq", "id", "log-7"]] }]);
  });
});

describe("deleteStaleMailLog", () => {
  const input = {
    userId: "user-1",
    projectId: "proj-1",
    mailType: "reminder_30" as const,
    sentBefore: new Date("2027-08-15T12:00:00Z"),
  };

  it("only deletes markers of this user/project/type set before the cutoff", async () => {
    nextDeleteResult = { data: [{ id: "old" }], error: null };
    await expect(deleteStaleMailLog(input)).resolves.toBe(true);
    expect(deleteCalls[0]?.filters).toEqual([
      ["eq", "user_id", "user-1"],
      ["eq", "project_id", "proj-1"],
      ["eq", "mail_type", "reminder_30"],
      ["lt", "sent_at", "2027-08-15T12:00:00.000Z"],
    ]);
  });

  it("reports false when the existing marker is current", async () => {
    await expect(deleteStaleMailLog(input)).resolves.toBe(false);
  });

  it("reports false on database errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    nextDeleteResult = { data: null, error: { message: "boom" } };
    await expect(deleteStaleMailLog(input)).resolves.toBe(false);
  });
});

describe("reserveMailLog", () => {
  it("happy path: returns reserved + log ID", async () => {
    const result = await reserveMailLog({
      userId: "user-1",
      projectId: null,
      mailType: "welcome",
    });
    expect(result.reserved).toBe(true);
    if (result.reserved) expect(result.logId).toBe("log-1");
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.payload).toEqual({
      user_id: "user-1",
      project_id: null,
      mail_type: "welcome",
    });
  });

  it("returns duplicate on unique-violation (23505)", async () => {
    nextInsertResult = {
      data: null,
      error: { code: "23505", message: "duplicate" },
    };
    const result = await reserveMailLog({
      userId: "user-1",
      projectId: "proj-1",
      mailType: "reminder_30",
    });
    expect(result.reserved).toBe(false);
    if (!result.reserved) expect(result.reason).toBe("duplicate");
  });

  it("returns db_error on other failures", async () => {
    nextInsertResult = {
      data: null,
      error: { code: "23514", message: "check constraint failed" },
    };
    const result = await reserveMailLog({
      userId: "user-1",
      projectId: null,
      mailType: "welcome",
    });
    expect(result.reserved).toBe(false);
    if (!result.reserved) expect(result.reason).toBe("db_error");
  });
});

describe("finalizeMailLog", () => {
  it("happy path: writes resend_message_id, clears error", async () => {
    await finalizeMailLog("log-1", {
      ok: true,
      resendMessageId: "msg_abc",
    });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.payload).toEqual({
      resend_message_id: "msg_abc",
      error: null,
    });
  });

  it("error path: writes error, clears resend_message_id", async () => {
    await finalizeMailLog("log-1", { ok: false, error: "send failed" });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.payload).toEqual({
      resend_message_id: null,
      error: "send failed",
    });
  });
});
