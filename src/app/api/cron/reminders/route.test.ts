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

const retryMock = vi.fn(async () => ({ retried: 0, sent: 0, dropped: 0, gaveUp: 0 }));
vi.mock("@/lib/email/retry-mails", () => ({
  processMailRetryQueue: () => retryMock(),
}));

const storageCleanupMock = vi.fn(async () => ({ processed: 0, cleaned: 0, failed: 0 }));
const chapterCleanupMock = vi.fn(async () => ({ processed: 0, cleaned: 0, failed: 0 }));
const callOrder: string[] = [];
vi.mock("@/lib/projects/storage-cleanup", () => ({
  processStorageCleanup: () => {
    callOrder.push("storage");
    return storageCleanupMock();
  },
  processChapterStorageCleanup: () => {
    callOrder.push("chapters");
    return chapterCleanupMock();
  },
}));

const trashPurgeMock = vi.fn(async () => ({ projects: 0, chapters: 0 }));
vi.mock("@/lib/projects/trash", () => ({
  purgeDueTrash: () => {
    callOrder.push("purge");
    return trashPurgeMock();
  },
}));

const emptyRetention = { due: 0, moved: 0, skipped: 0, failed: 0, braked: false };
const retentionMock = vi.fn(async () => emptyRetention);
vi.mock("@/lib/projects/retention", () => ({
  moveExpiredProjectsToTrash: () => {
    callOrder.push("retention");
    return retentionMock();
  },
}));

// Service-Role-Client-Mock — chained Supabase builders.
type FakeRow = Record<string, unknown>;
let accessRows: FakeRow[] = [];
let memberRows: FakeRow[] = [];
let projectRow: FakeRow | null = null;
let profileRow: FakeRow | null = null;
/** Filter, die auf project_members angewendet wurden. */
let memberFilters: Array<[string, unknown]> = [];

function chainable(result: { data: unknown; error?: unknown }, filters?: Array<[string, unknown]>) {
  const chain = {
    eq: vi.fn((col: string, val: unknown) => {
      filters?.push([col, val]);
      return chain;
    }),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (cb: (v: typeof result) => unknown) => Promise.resolve(cb(result)),
  };
  return chain;
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
          select: vi.fn(() => chainable({ data: memberRows }, memberFilters)),
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
import { calendarDaysUntil } from "@/lib/email/format";
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
  memberFilters = [];
  nextSendResult = { sent: true };
  retryMock.mockReset().mockResolvedValue({ retried: 0, sent: 0, dropped: 0, gaveUp: 0 });
  storageCleanupMock.mockReset().mockResolvedValue({ processed: 0, cleaned: 0, failed: 0 });
  chapterCleanupMock.mockReset().mockResolvedValue({ processed: 0, cleaned: 0, failed: 0 });
  trashPurgeMock.mockReset().mockResolvedValue({ projects: 0, chapters: 0 });
  retentionMock.mockReset().mockResolvedValue(emptyRetention);
  callOrder.length = 0;
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

  it("rejects a secret that only shares the prefix", async () => {
    const res = await GET(
      makeRequest({ authorization: "Bearer test_cron_secret_123-extra" }),
    );
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
    // Kalendertage in deutscher Zeit, passend zum Datum in der Mail (BUG-15).
    expect(sendCalls[0]).toMatchObject({
      expiresAt: inThirtyDays,
      daysLeft: calendarDaysUntil(inThirtyDays),
    });
  });

  it("catches up a missed 7-day reminder and passes the real days left", async () => {
    // Ein ausgefallener Cron-Lauf darf die Erinnerung nicht verschlucken:
    // 3 Tage vor Ablauf liegt der Zugang weiterhin im 7-Tage-Fenster.
    const inThreeDays = new Date(
      Date.now() + 2.5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    accessRows = [{ project_id: "proj-1", expires_at: inThreeDays }];
    memberRows = [{ user_id: "user-pl" }];
    projectRow = { title: "Mein Lebensbuch" };
    profileRow = { email: "pl@example.com", full_name: "Maria" };

    await GET(makeRequest({ "x-cron-secret": "test_cron_secret_123" }));

    // Der Mock liefert für beide Fenster dieselben Zeilen; maßgeblich ist
    // der Aufruf aus dem 7-Tage-Fenster.
    const sevenDayCall = sendCalls.find(
      (c) => (c as { variant: string }).variant === "7",
    );
    expect(sevenDayCall).toMatchObject({
      daysLeft: calendarDaysUntil(inThreeDays),
      expiresAt: inThreeDays,
    });
  });

  it("never reports less than one day on the day of expiry", async () => {
    const inOneHour = new Date(Date.now() + 60 * 1000).toISOString();
    accessRows = [{ project_id: "proj-1", expires_at: inOneHour }];
    memberRows = [{ user_id: "user-pl" }];
    projectRow = { title: "Mein Lebensbuch" };
    profileRow = { email: "pl@example.com", full_name: "Maria" };

    await GET(makeRequest({ "x-cron-secret": "test_cron_secret_123" }));

    expect((sendCalls[0] as { daysLeft: number }).daysLeft).toBeGreaterThanOrEqual(1);
  });

  it("retries failed mails and reports them (BUG-13)", async () => {
    retryMock.mockResolvedValue({ retried: 2, sent: 1, dropped: 1, gaveUp: 0 });

    const res = await GET(makeRequest({ "x-cron-secret": "test_cron_secret_123" }));
    const json = await res.json();

    expect(retryMock).toHaveBeenCalledTimes(1);
    expect(json.mailRetries).toEqual({ retried: 2, sent: 1, dropped: 1, gaveUp: 0 });
  });

  it("still sends reminders when the retry step crashes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    retryMock.mockRejectedValue(new Error("queue down"));
    const inThirtyDays = new Date(Date.now() + 29.5 * 24 * 60 * 60 * 1000).toISOString();
    accessRows = [{ project_id: "proj-1", expires_at: inThirtyDays }];
    memberRows = [{ user_id: "user-pl" }];
    projectRow = { title: "Mein Lebensbuch" };
    profileRow = { email: "pl@example.com", full_name: "Maria" };

    const res = await GET(makeRequest({ "x-cron-secret": "test_cron_secret_123" }));

    expect(res.status).toBe(200);
    expect(sendCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("does not touch the retry queue without a valid secret", async () => {
    await GET(makeRequest({ "x-cron-secret": "wrong" }));
    expect(retryMock).not.toHaveBeenCalled();
    expect(storageCleanupMock).not.toHaveBeenCalled();
  });

  it("cleans up files of deleted projects and reports it (PROJ-3)", async () => {
    storageCleanupMock.mockResolvedValueOnce({ processed: 2, cleaned: 1, failed: 1 });

    const res = await GET(makeRequest({ "x-cron-secret": "test_cron_secret_123" }));
    const json = await res.json();

    expect(json.storageCleanup).toEqual({ processed: 2, cleaned: 1, failed: 1 });
  });

  it("still answers when the storage cleanup crashes (PROJ-3)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    storageCleanupMock.mockRejectedValueOnce(new Error("storage down"));

    const res = await GET(makeRequest({ "x-cron-secret": "test_cron_secret_123" }));

    expect(res.status).toBe(200);
  });

  it("sends no reminder for a deleted project, it has no members anymore (PROJ-26)", async () => {
    accessRows = [
      {
        project_id: "proj-deleted",
        expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
    memberRows = [];
    projectRow = { title: "Gelöschtes Buch" };

    const res = await GET(makeRequest({ "x-cron-secret": "test_cron_secret_123" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sent).toBe(0);
    expect(sendCalls).toHaveLength(0);
  });

  it("purges the trash first, so files go in the same run (PROJ-26)", async () => {
    trashPurgeMock.mockResolvedValueOnce({ projects: 1, chapters: 2 });
    chapterCleanupMock.mockResolvedValueOnce({ processed: 2, cleaned: 2, failed: 0 });

    const res = await GET(makeRequest({ "x-cron-secret": "test_cron_secret_123" }));
    const json = await res.json();

    expect(callOrder).toEqual(["retention", "purge", "storage", "chapters"]);
    expect(json.trashPurge).toEqual({ projects: 1, chapters: 2 });
    expect(json.chapterStorageCleanup).toEqual({ processed: 2, cleaned: 2, failed: 0 });
  });

  it("does not touch the trash without the secret (PROJ-26)", async () => {
    const res = await GET(makeRequest({}));

    expect(res.status).toBe(401);
    expect(trashPurgeMock).not.toHaveBeenCalled();
    expect(retentionMock).not.toHaveBeenCalled();
  });

  it("reports the retention run (PROJ-28)", async () => {
    const run = { due: 2, moved: 1, skipped: 1, failed: 0, braked: false };
    retentionMock.mockResolvedValueOnce(run);

    const res = await GET(makeRequest({ "x-cron-secret": "test_cron_secret_123" }));
    const json = await res.json();

    expect(json.retention).toEqual(run);
  });

  it("keeps running when the retention run crashes (PROJ-28)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    retentionMock.mockRejectedValueOnce(new Error("db down"));

    const res = await GET(makeRequest({ "x-cron-secret": "test_cron_secret_123" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.retention).toEqual(emptyRetention);
    expect(trashPurgeMock).toHaveBeenCalledTimes(1);
    expect(storageCleanupMock).toHaveBeenCalledTimes(1);
  });

  it("keeps running when the trash purge crashes (PROJ-26)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    trashPurgeMock.mockRejectedValueOnce(new Error("db down"));

    const res = await GET(makeRequest({ "x-cron-secret": "test_cron_secret_123" }));

    expect(res.status).toBe(200);
    expect(storageCleanupMock).toHaveBeenCalledTimes(1);
    expect(chapterCleanupMock).toHaveBeenCalledTimes(1);
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

  it("reminds every project member, not only the Projektleiter", async () => {
    // Verlängern kann jedes Mitglied — z. B. die beschenkte Person als
    // Co-Autorin (Jakob, 2026-11-19).
    const inThirtyDays = new Date(
      Date.now() + 29.5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    accessRows = [{ project_id: "proj-1", expires_at: inThirtyDays }];
    memberRows = [{ user_id: "user-pl" }, { user_id: "user-co" }];
    projectRow = { title: "Omas Lebensbuch" };
    profileRow = { email: "member@example.com", full_name: "Mitglied" };

    await GET(makeRequest({ "x-cron-secret": "test_cron_secret_123" }));

    const thirtyDayRecipients = sendCalls
      .filter((c) => (c as { variant: string }).variant === "30")
      .map((c) => (c as { userId: string }).userId);
    expect(thirtyDayRecipients).toEqual(["user-pl", "user-co"]);
    // Keine Einschränkung auf die Rolle mehr.
    expect(memberFilters.some(([col]) => col === "role")).toBe(false);
    expect(memberFilters).toContainEqual(["project_id", "proj-1"]);
  });

  it("skips projects without members", async () => {
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
