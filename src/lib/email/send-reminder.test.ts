import { describe, it, expect, vi, beforeEach } from "vitest";

import { sendEmail } from "./client";
import {
  reserveMailLog,
  finalizeMailLog,
  releaseMailLog,
  deleteStaleMailLog,
} from "./idempotency";
import { maybeSendReminderMail, type SendReminderInput } from "./send-reminder";

vi.mock("./client", () => ({
  sendEmail: vi.fn(),
  getSiteUrl: () => "https://app.example.test",
  hashEmailForLog: () => "hash1234",
}));
vi.mock("./idempotency", () => ({
  reserveMailLog: vi.fn(),
  finalizeMailLog: vi.fn(async () => undefined),
  releaseMailLog: vi.fn(async () => undefined),
  deleteStaleMailLog: vi.fn(async () => false),
}));

const DAY = 24 * 60 * 60 * 1000;
const expiresAt = "2027-10-14T12:00:00.000Z";

function input(overrides: Partial<SendReminderInput> = {}): SendReminderInput {
  return {
    to: "pl@example.test",
    userId: "user-1",
    projectId: "proj-1",
    variant: "30",
    projectName: "Omas Lebensbuch",
    expiresAt,
    expiresAtFormatted: "14. Oktober 2027",
    daysLeft: 30,
    renewUrl: "https://app.example.test/projektuebersicht/proj-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(sendEmail).mockReset().mockResolvedValue({ ok: true, messageId: "msg_1", redirected: false });
  vi.mocked(reserveMailLog).mockReset().mockResolvedValue({ reserved: true, logId: "log-1" });
  vi.mocked(deleteStaleMailLog).mockReset().mockResolvedValue(false);
  vi.mocked(finalizeMailLog).mockClear();
  vi.mocked(releaseMailLog).mockClear();
});

describe("maybeSendReminderMail", () => {
  it("sends the reminder and records the Resend id", async () => {
    const res = await maybeSendReminderMail(input());
    expect(res).toEqual({ sent: true });
    expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toBe(
      "Erinnerung: Ihr Portal-Zugang für „Omas Lebensbuch\" läuft in 30 Tagen ab",
    );
    expect(finalizeMailLog).toHaveBeenCalledWith("log-1", { ok: true, resendMessageId: "msg_1" });
  });

  it("replaces last year's marker after a renewal (BUG-6)", async () => {
    vi.mocked(reserveMailLog)
      .mockResolvedValueOnce({ reserved: false, reason: "duplicate" })
      .mockResolvedValueOnce({ reserved: true, logId: "log-2" });
    vi.mocked(deleteStaleMailLog).mockResolvedValue(true);

    const res = await maybeSendReminderMail(input());

    expect(deleteStaleMailLog).toHaveBeenCalledWith({
      userId: "user-1",
      projectId: "proj-1",
      mailType: "reminder_30",
      sentBefore: new Date(Date.parse(expiresAt) - 60 * DAY),
    });
    expect(res).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("skips when the reminder for this expiry date was already sent", async () => {
    vi.mocked(reserveMailLog).mockResolvedValue({ reserved: false, reason: "duplicate" });
    const res = await maybeSendReminderMail(input());
    expect(res).toEqual({ sent: false, skipped: "duplicate" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("releases the marker when sending fails, so the next cron run retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, error: "resend down", redirected: false });
    const res = await maybeSendReminderMail(input());
    expect(res).toEqual({ sent: false, skipped: "send_failed" });
    expect(releaseMailLog).toHaveBeenCalledWith("log-1");
  });

  it("uses the singular on the last day", async () => {
    await maybeSendReminderMail(input({ variant: "7", daysLeft: 1 }));
    expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toBe(
      "Nur noch 1 Tag Portal-Zugang für „Omas Lebensbuch\"",
    );
  });
});
