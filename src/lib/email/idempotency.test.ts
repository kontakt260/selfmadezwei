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
    }),
  }),
}));

import { reserveMailLog, finalizeMailLog } from "./idempotency";

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
  nextInsertResult = { data: { id: "log-1" }, error: null };
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
