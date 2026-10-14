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

import { sendEmail, hashEmailForLog, getSiteUrl, sanitizeSubject } from "./client";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EMAIL_TEST_RECIPIENT;
  delete process.env.VERCEL_ENV;
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
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "narravit <no-reply@test.local>",
        to: "user@example.com",
        subject: "Test",
        html: "<html>mocked</html>",
        text: "<html>mocked</html>",
      }),
    );
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
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: "qa@narravit.de" }),
    );
  });

  it("ignores EMAIL_TEST_RECIPIENT in the Vercel production environment", async () => {
    process.env.EMAIL_TEST_RECIPIENT = "qa@narravit.de";
    process.env.VERCEL_ENV = "production";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSend.mockResolvedValueOnce({ data: { id: "msg_ok" }, error: null });

    const result = await sendEmail({
      to: "real-user@example.com",
      subject: "Test",
      react: { type: "div", props: {}, key: null } as never,
    });
    if (result.ok) expect(result.redirected).toBe(false);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: "real-user@example.com" }),
    );
  });

  it("strips line breaks from the subject before sending", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "msg_ok" }, error: null });
    await sendEmail({
      to: "user@example.com",
      subject: "Einladung zum Projekt „Oma\r\nBcc: x@evil.example\"",
      react: { type: "div", props: {}, key: null } as never,
    });
    expect(mockSend).toHaveBeenCalledWith(
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
