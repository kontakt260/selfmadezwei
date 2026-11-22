import { describe, it, expect, vi, beforeEach } from "vitest";

const inserted: Array<Record<string, unknown>> = [];
let insertError: { message: string } | null = null;

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return Promise.resolve({ error: insertError });
      },
    }),
  }),
}));
vi.mock("./client", () => ({
  sendEmail: vi.fn(),
  getSiteUrl: () => "https://app.example.test",
  hashEmailForLog: () => "hash1234",
}));

import { sendEmail } from "./client";
import { recordMailResult, type RetryableMail } from "./retry-queue";
import { sendGuestPurchaseMail } from "./send-guest-purchase";

const mail: RetryableMail = {
  kind: "renewal_info",
  input: {
    to: "maria@example.test",
    renewedBy: "Peter",
    projectName: "Omas Lebensbuch",
    newExpiresAtFormatted: "22. November 2027",
  },
};

beforeEach(() => {
  inserted.length = 0;
  insertError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("recordMailResult", () => {
  it("does nothing after a successful send", async () => {
    await recordMailResult(mail, { ok: true, messageId: "msg", redirected: false });
    expect(inserted).toHaveLength(0);
  });

  it("queues a mail that can succeed later", async () => {
    await recordMailResult(mail, { ok: false, error: "resend down", redirected: false, retryable: true });
    expect(inserted).toEqual([
      { kind: "renewal_info", payload: mail.input, last_error: "resend down" },
    ]);
  });

  it("does not queue permanent failures", async () => {
    await recordMailResult(mail, { ok: false, error: "Ungültige Empfänger-Adresse", redirected: false });
    expect(inserted).toHaveLength(0);
  });

  it("never logs the recipient in clear text", async () => {
    await recordMailResult(mail, { ok: false, error: "down", redirected: false, retryable: true });
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain("maria@example.test");
  });

  it("does not throw when the queue cannot be written", async () => {
    insertError = { message: "table missing" };
    await expect(
      recordMailResult(mail, { ok: false, error: "down", redirected: false, retryable: true }),
    ).resolves.toBeUndefined();
  });
});

describe("sendGuestPurchaseMail", () => {
  it("never stores the claim secret in the queue", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, error: "down", redirected: false, retryable: true });

    await sendGuestPurchaseMail({
      to: "maria@example.test",
      stripeSessionId: "cs_test_12345678",
      amountFormatted: "249,00 €",
      paymentDateFormatted: "22. November 2026",
      claimCode: "geheimes-einloese-token",
    });

    expect(inserted).toHaveLength(1);
    expect(JSON.stringify(inserted[0])).not.toContain("geheimes-einloese-token");
    expect(inserted[0].payload).toMatchObject({ stripeSessionId: "cs_test_12345678" });
  });
});
