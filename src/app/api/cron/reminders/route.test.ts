import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-dummy";
process.env.CRON_SECRET = "test_cron_secret_123";
process.env.NEXT_PUBLIC_SITE_URL = "https://stage-app.narravit.de";

// Mock send-reminder so wir keine echten Mails schicken und die Cron-Logik
// isoliert testen können.
const sendCalls: Array<unknown> = [];
let nextSendResult: { sent: boolean; skipped?: string } = { sent: true };
vi.mock("@/lib/email/send-reminder", () => ({
  maybeSendReminderMail: vi.fn((input: unknown) => {
    sendCalls.push(input);
    return Promise.resolve(nextSendResult);
  }),
}));

// Service-Role-Client-Mock — chained Supabase builders.
type FakeRow = Record<string, unknown>;
let accessRows: FakeRow[] = [];
let memberRows: FakeRow[] = [];
let projectRow: FakeRow | null = null;
let profileRow: FakeRow | null = null;

function chainable(result: { data: unknown; error?: unknown }) {
  return {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (cb: (v: typeof result) => unknown) => Promise.resolve(cb(result)),
  };
}

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === "project_access") {
        return {
          select: vi.fn().mockReturnValue(chainable({ data: accessRows })),
        };
      }
      if (table === "project_members") {
        return {
          select: vi.fn().mockReturnValue(chainable({ data: memberRows })),
        };
      }
      if (table === "projects") {
        return {
          select: vi.fn().mockReturnValue(chainable({ data: projectRow })),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue(chainable({ data: profileRow })),
        };
      }
      throw new Error(`Unmocked table: ${table}`);
    },
  }),
}));

import { GET } from "./route";
import type { NextRequest } from "next/server";

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  const reqHeaders = new Headers(headers);
  return {
    headers: {
      get: (name: string) => reqHeaders.get(name),
    },
  } as unknown as NextRequest;
}

beforeEach(() => {
  sendCalls.length = 0;
  accessRows = [];
  memberRows = [];
  projectRow = null;
  profileRow = null;
  nextSendResult = { sent: true };
});

describe("/api/cron/reminders — auth", () => {
  it("returns 401 without secret header", async () => {
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("accepts x-cron-secret header", async () => {
    const res = await GET(makeRequest({ "x-cron-secret": "test_cron_secret_123" }));
    expect(res.status).toBe(200);
  });

  it("accepts Vercel-style Authorization: Bearer header", async () => {
    const res = await GET(
      makeRequest({ authorization: "Bearer test_cron_secret_123" }),
    );
    expect(res.status).toBe(200);
  });

  it("rejects wrong secret with 401", async () => {
    const res = await GET(makeRequest({ "x-cron-secret": "wrong" }));
    expect(res.status).toBe(401);
  });
});

describe("/api/cron/reminders — happy path", () => {
  it("processes a match in the 30-day window and sends mail", async () => {
    // Set up: one project with expires_at ~29.5 days out, one PL.
    const inThirtyDays = new Date(
      Date.now() + 29.5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    accessRows = [
      { project_id: "proj-1", expires_at: inThirtyDays },
    ];
    memberRows = [{ user_id: "user-pl" }];
    projectRow = { title: "Mein Lebensbuch" };
    profileRow = { email: "pl@example.com", full_name: "Maria" };

    const res = await GET(
      makeRequest({ "x-cron-secret": "test_cron_secret_123" }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processed).toBeGreaterThanOrEqual(1);
    expect(json.sent).toBeGreaterThanOrEqual(1);
    expect(sendCalls.length).toBeGreaterThanOrEqual(1);
    const firstCall = sendCalls[0] as {
      to: string;
      variant: string;
      projectName: string;
    };
    expect(firstCall.to).toBe("pl@example.com");
    expect(firstCall.variant).toBe("30");
    expect(firstCall.projectName).toBe("Mein Lebensbuch");
  });

  it("skips when reserve returns duplicate (already-sent)", async () => {
    nextSendResult = { sent: false, skipped: "duplicate" };
    const inThirtyDays = new Date(
      Date.now() + 29.5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    accessRows = [{ project_id: "proj-1", expires_at: inThirtyDays }];
    memberRows = [{ user_id: "user-pl" }];
    projectRow = { title: "Test" };
    profileRow = { email: "pl@example.com", full_name: null };

    const res = await GET(
      makeRequest({ "x-cron-secret": "test_cron_secret_123" }),
    );
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(json.skipped).toBeGreaterThanOrEqual(1);
  });

  it("skips projects with no PL", async () => {
    const inSevenDays = new Date(
      Date.now() + 6.5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    accessRows = [{ project_id: "proj-orphan", expires_at: inSevenDays }];
    memberRows = []; // kein PL
    const res = await GET(
      makeRequest({ "x-cron-secret": "test_cron_secret_123" }),
    );
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(sendCalls).toHaveLength(0);
  });

  it("skips PL without email in profile", async () => {
    const inThirtyDays = new Date(
      Date.now() + 29.5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    accessRows = [{ project_id: "proj-1", expires_at: inThirtyDays }];
    memberRows = [{ user_id: "user-pl" }];
    projectRow = { title: "Test" };
    profileRow = { email: null, full_name: null };

    const res = await GET(
      makeRequest({ "x-cron-secret": "test_cron_secret_123" }),
    );
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(sendCalls).toHaveLength(0);
  });
});

describe("/api/cron/reminders — config", () => {
  it("returns 500 when CRON_SECRET is not set", async () => {
    const orig = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(500);
    process.env.CRON_SECRET = orig;
  });
});
