// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@react-email/render";

import { sendEmail } from "./client";
import { resolveWelcomeDiscountCode } from "./welcome-discount";
import {
  reserveMailLog,
  finalizeMailLog,
  releaseMailLog,
  deleteAbandonedMailLog,
} from "./idempotency";
import { isRecentSignup, maybeSendWelcomeMail } from "./send-welcome";

vi.mock("./client", () => ({
  sendEmail: vi.fn(),
  getSiteUrl: () => "https://app.example.test",
  hashEmailForLog: () => "hash1234",
}));
vi.mock("./idempotency", () => ({
  reserveMailLog: vi.fn(),
  finalizeMailLog: vi.fn(async () => undefined),
  releaseMailLog: vi.fn(async () => undefined),
  deleteAbandonedMailLog: vi.fn(async () => false),
}));
vi.mock("./welcome-discount", () => ({
  WELCOME_DISCOUNT_LABEL: "50 €",
  resolveWelcomeDiscountCode: vi.fn(async () => undefined),
}));

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.mocked(sendEmail).mockReset();
  vi.mocked(reserveMailLog).mockReset().mockResolvedValue({ reserved: true, logId: "log-1" });
  vi.mocked(deleteAbandonedMailLog).mockReset().mockResolvedValue(false);
  vi.mocked(resolveWelcomeDiscountCode).mockReset().mockResolvedValue(undefined);
  vi.mocked(finalizeMailLog).mockClear();
  vi.mocked(releaseMailLog).mockClear();
});

describe("isRecentSignup", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");

  it("accepts accounts created within the last 14 days", () => {
    expect(isRecentSignup(new Date(now - 60_000).toISOString(), now)).toBe(true);
    expect(isRecentSignup(new Date(now - 14 * DAY).toISOString(), now)).toBe(true);
  });

  it("rejects older accounts and missing dates", () => {
    expect(isRecentSignup(new Date(now - 15 * DAY).toISOString(), now)).toBe(false);
    expect(isRecentSignup(undefined, now)).toBe(false);
    expect(isRecentSignup("kein Datum", now)).toBe(false);
  });
});

describe("maybeSendWelcomeMail", () => {
  const input = { to: "maria@example.test", userId: "user-1", fullName: "Maria" };

  it("sends once and records the Resend id", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: true, messageId: "msg_1", redirected: false });
    await maybeSendWelcomeMail(input);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(finalizeMailLog).toHaveBeenCalledWith("log-1", { ok: true, resendMessageId: "msg_1" });
    expect(releaseMailLog).not.toHaveBeenCalled();
  });

  it("releases the marker when sending fails, so the next login retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, error: "RESEND_API_KEY is not set", redirected: false });
    await maybeSendWelcomeMail(input);
    expect(releaseMailLog).toHaveBeenCalledWith("log-1");
    expect(finalizeMailLog).not.toHaveBeenCalled();
  });

  it("skips the send when the account was already welcomed", async () => {
    vi.mocked(reserveMailLog).mockResolvedValue({ reserved: false, reason: "duplicate" });
    await maybeSendWelcomeMail(input);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("recovers a marker whose send never finished (BUG-18)", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: true, messageId: "msg_2", redirected: false });
    vi.mocked(reserveMailLog)
      .mockResolvedValueOnce({ reserved: false, reason: "duplicate" })
      .mockResolvedValueOnce({ reserved: true, logId: "log-2" });
    vi.mocked(deleteAbandonedMailLog).mockResolvedValue(true);

    await maybeSendWelcomeMail(input);

    expect(deleteAbandonedMailLog).toHaveBeenCalledWith({
      userId: "user-1",
      projectId: null,
      mailType: "welcome",
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("shows the discount code for a plain registration", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: true, messageId: "msg_3", redirected: false });
    vi.mocked(resolveWelcomeDiscountCode).mockResolvedValue("WILLKOMMEN50");

    await maybeSendWelcomeMail({ ...input, offerDiscount: true });

    expect(resolveWelcomeDiscountCode).toHaveBeenCalledWith({
      userId: "user-1",
      email: "maria@example.test",
    });
    const html = await render(vi.mocked(sendEmail).mock.calls[0][0].react);
    expect(html).toContain("WILLKOMMEN50");
  });

  it("does not look up a code on the way through a purchase or invitation", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: true, messageId: "msg_4", redirected: false });

    await maybeSendWelcomeMail({ ...input, offerDiscount: false });

    expect(resolveWelcomeDiscountCode).not.toHaveBeenCalled();
    const html = await render(vi.mocked(sendEmail).mock.calls[0][0].react);
    expect(html).not.toContain("Rabatt");
  });
});
