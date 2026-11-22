import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks BEVOR import.
const mockSend = vi.fn();
vi.mock("resend", () => {
  class MockResend {
    emails: { send: typeof mockSend };
    constructor() {
      this.emails = { send: mockSend };
    }
  }
  return { Resend: MockResend };
});
vi.mock("@react-email/render", () => ({
  render: vi.fn().mockResolvedValue("<html>mocked</html>"),
}));

process.env.RESEND_API_KEY = "re_test_key";
process.env.EMAIL_FROM = "narravit <no-reply@test.local>";
process.env.NEXT_PUBLIC_SITE_URL = "https://stage-app.narravit.de";

import { render } from "@react-email/render";
import { sendEmail, hashEmailForLog, getSiteUrl, sanitizeSubject } from "./client";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EMAIL_TEST_RECIPIENT;
});

describe("sendEmail", () => {
  it("rejects empty / invalid recipient", async () => {
    const result = await sendEmail({
      to: "no-at-sign",
      subject: "hi",
      react: { type: "div", props: {}, key: null } as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Ungültige/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects recipient longer than 254 chars", async () => {
    const longLocal = "a".repeat(260);
    const result = await sendEmail({
      to: `${longLocal}@example.com`,
      subject: "hi",
      react: { type: "div", props: {}, key: null } as never,
    });
    expect(result.ok).toBe(false);
  });

  it("happy path: returns messageId from Resend response", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "msg_abc123" }, error: null });
    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      react: { type: "div", props: {}, key: null } as never,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messageId).toBe("msg_abc123");
      expect(result.redirected).toBe(false);
    }
    expect(mockSend.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        from: "narravit <no-reply@test.local>",
        to: "user@example.com",
        subject: "Test",
        html: "<html>mocked</html>",
        text: "<html>mocked</html>",
      }),
    );
  });

  it("sends HTML as pure ASCII, plain text and subject stay readable UTF-8", async () => {
    vi.mocked(render)
      .mockResolvedValueOnce("<p>für „Oma“ — Impressum · 😀</p>")
      .mockResolvedValueOnce("für „Oma“ — Impressum · 😀");
    mockSend.mockResolvedValueOnce({ data: { id: "msg_ok" }, error: null });

    await sendEmail({
      to: "user@example.com",
      subject: "Einladung für „Oma“",
      react: { type: "div", props: {}, key: null } as never,
    });

    const sent = mockSend.mock.calls[0][0];
    expect(sent.html).toBe(
      "<p>f&#252;r &#8222;Oma&#8220; &#8212; Impressum &#183; &#128512;</p>",
    );
    expect(sent.html).not.toMatch(/[^\x00-\x7F]/);
    expect(sent.text).toBe("für „Oma“ — Impressum · 😀");
    expect(sent.subject).toBe("Einladung für „Oma“");
  });

  it("redirects to EMAIL_TEST_RECIPIENT when set (stage/local override)", async () => {
    process.env.EMAIL_TEST_RECIPIENT = "qa@narravit.de";
    mockSend.mockResolvedValueOnce({ data: { id: "msg_ok" }, error: null });

    const result = await sendEmail({
      to: "real-user@example.com",
      subject: "Test",
      react: { type: "div", props: {}, key: null } as never,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.redirected).toBe(true);
    expect(mockSend.mock.calls[0][0]).toEqual(
      expect.objectContaining({ to: "qa@narravit.de" }),
    );
  });

  it("ignores EMAIL_TEST_RECIPIENT on the customer domain app.narravit.de", async () => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.narravit.de";
    process.env.EMAIL_TEST_RECIPIENT = "qa@narravit.de";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSend.mockResolvedValueOnce({ data: { id: "msg_ok" }, error: null });

    const result = await sendEmail({
      to: "real-user@example.com",
      subject: "Test",
      react: { type: "div", props: {}, key: null } as never,
    });
    process.env.NEXT_PUBLIC_SITE_URL = siteUrl;
    if (result.ok) expect(result.redirected).toBe(false);
    expect(mockSend.mock.calls[0][0]).toEqual(
      expect.objectContaining({ to: "real-user@example.com" }),
    );
  });

  it("keeps redirecting on stage even if Vercel reports VERCEL_ENV=production", async () => {
    // Stage kann in Vercel als Umgebung „Production" laufen — der Override
    // muss dort trotzdem greifen.
    process.env.VERCEL_ENV = "production";
    process.env.EMAIL_TEST_RECIPIENT = "qa@narravit.de";
    mockSend.mockResolvedValueOnce({ data: { id: "msg_ok" }, error: null });

    await sendEmail({
      to: "real-user@example.com",
      subject: "Test",
      react: { type: "div", props: {}, key: null } as never,
    });
    delete process.env.VERCEL_ENV;
    expect(mockSend.mock.calls[0][0]).toEqual(
      expect.objectContaining({ to: "qa@narravit.de" }),
    );
  });

  it("strips line breaks from the subject before sending", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "msg_ok" }, error: null });
    await sendEmail({
      to: "user@example.com",
      subject: "Einladung zum Projekt „Oma\r\nBcc: x@evil.example\"",
      react: { type: "div", props: {}, key: null } as never,
    });
    expect(mockSend.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        subject: "Einladung zum Projekt „Oma Bcc: x@evil.example\"",
      }),
    );
  });

  it("returns error when Resend API returns error", async () => {
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { message: "API limit exceeded" },
    });
    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      react: { type: "div", props: {}, key: null } as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("API limit exceeded");
  });

  it("catches thrown errors from Resend SDK", async () => {
    mockSend.mockRejectedValueOnce(new Error("network down"));
    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      react: { type: "div", props: {}, key: null } as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("network down");
  });

  describe("Wiederholung und Warteschlange (BUG-13)", () => {
    const mail = {
      to: "user@example.com",
      subject: "Test",
      react: { type: "div", props: {}, key: null } as never,
    };

    async function sendWithTimers() {
      vi.useFakeTimers();
      try {
        const pending = sendEmail(mail);
        await vi.runAllTimersAsync();
        return await pending;
      } finally {
        vi.useRealTimers();
      }
    }

    it("retries a rate limit with the same idempotency key", async () => {
      mockSend
        .mockResolvedValueOnce({
          data: null,
          error: { name: "rate_limit_exceeded", statusCode: 429, message: "slow down" },
        })
        .mockResolvedValueOnce({ data: { id: "msg_retry" }, error: null });

      const result = await sendWithTimers();

      expect(result).toMatchObject({ ok: true, messageId: "msg_retry" });
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend.mock.calls[1][1].idempotencyKey).toBe(mockSend.mock.calls[0][1].idempotencyKey);
    });

    it("gives up after three attempts and marks the mail for the queue", async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { name: "internal_server_error", statusCode: 500, message: "down" },
      });

      const result = await sendWithTimers();
      mockSend.mockReset();

      expect(result).toMatchObject({ ok: false, error: "down", retryable: true });
    });

    it("does not retry at once when the quota is used up, but queues the mail", async () => {
      mockSend.mockResolvedValueOnce({
        data: null,
        error: { name: "daily_quota_exceeded", statusCode: 429, message: "quota" },
      });

      const result = await sendEmail(mail);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ ok: false, retryable: true });
    });

    it("does not queue an invalid recipient", async () => {
      const result = await sendEmail({ ...mail, to: "no-at-sign" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.retryable).toBeUndefined();
    });

    it("does not queue when the API key is missing (local development)", async () => {
      const key = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;
      vi.resetModules();
      const fresh = await import("./client");

      const result = await fresh.sendEmail(mail);

      process.env.RESEND_API_KEY = key;
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.retryable).toBeUndefined();
    });
  });
});

describe("hashEmailForLog", () => {
  it("produces stable 8-char hash regardless of case/whitespace", () => {
    const a = hashEmailForLog("user@example.com");
    const b = hashEmailForLog("  USER@example.com  ");
    expect(a).toBe(b);
    expect(a).toHaveLength(8);
  });

  it("different emails produce different hashes", () => {
    expect(hashEmailForLog("a@example.com")).not.toBe(
      hashEmailForLog("b@example.com"),
    );
  });
});

describe("sanitizeSubject", () => {
  it("collapses line breaks and caps the length", () => {
    expect(sanitizeSubject("  Zeile 1\n\nZeile 2  ")).toBe("Zeile 1 Zeile 2");
    expect(sanitizeSubject("x".repeat(300))).toHaveLength(200);
  });
});

describe("getSiteUrl", () => {
  it("returns NEXT_PUBLIC_SITE_URL without trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://stage-app.narravit.de/";
    expect(getSiteUrl()).toBe("https://stage-app.narravit.de");
  });
});
