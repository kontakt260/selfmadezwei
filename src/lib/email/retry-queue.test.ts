import { describe, it, expect, vi, beforeEach } from "vitest";

const inserted: Array<Record<string, unknown>> = [];
let insertError: { message: string } | null = null;
let queueRows: Array<{ id: string; kind: string; payload: Record<string, unknown> }> = [];
let readError: { message: string } | null = null;

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return Promise.resolve({ error: insertError });
      },
      select: () => ({
        limit: async () => ({ data: readError ? null : queueRows, error: readError }),
      }),
      update: (patch: { payload: Record<string, unknown> }) => ({
        eq: async (_column: string, id: string) => {
          const row = queueRows.find((r) => r.id === id);
          if (row) row.payload = patch.payload;
          return { error: null };
        },
      }),
      delete: () => ({
        in: async (_column: string, ids: string[]) => {
          queueRows = queueRows.filter((r) => !ids.includes(r.id));
          return { error: null };
        },
      }),
    }),
  }),
}));
vi.mock("./client", () => ({
  sendEmail: vi.fn(),
  getSiteUrl: () => "https://app.example.test",
  hashEmailForLog: () => "hash1234",
}));

import { sendEmail } from "./client";
import { recordMailResult, removeQueuedMailsOfAccount, type RetryableMail } from "./retry-queue";
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
  queueRows = [];
  readError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("removeQueuedMailsOfAccount (BUG-20)", () => {
  const account = { email: "Maria@Example.test", fullName: "Maria Muster" };

  it("removes mails addressed to the deleted account, whatever the spelling", async () => {
    queueRows = [
      { id: "own", kind: "portal_purchase", payload: { to: " maria@example.TEST " } },
      { id: "other", kind: "portal_purchase", payload: { to: "peter@example.test" } },
    ];
    await removeQueuedMailsOfAccount(account);
    expect(queueRows.map((r) => r.id)).toEqual(["other"]);
  });

  it("keeps a paid gift invitation but removes the sender's name and address", async () => {
    queueRows = [
      {
        id: "gift",
        kind: "invitation",
        payload: {
          to: "oma@example.test",
          inviterName: "Maria Muster",
          inviterEmail: "maria@example.test",
          token: "tok",
          isGift: true,
        },
      },
    ];
    await removeQueuedMailsOfAccount(account);

    expect(queueRows).toHaveLength(1);
    const text = JSON.stringify(queueRows[0].payload);
    expect(text).not.toContain("Maria");
    expect(text).not.toContain("maria@example.test");
    expect(queueRows[0].payload).toMatchObject({ to: "oma@example.test", token: "tok", isGift: true });
  });

  it("drops a normal invitation sent by the deleted account", async () => {
    queueRows = [
      {
        id: "invite",
        kind: "invitation",
        payload: { to: "peter@example.test", inviterName: "Maria", inviterEmail: "maria@example.test" },
      },
    ];
    await removeQueuedMailsOfAccount(account);
    expect(queueRows).toHaveLength(0);
  });

  it.each(["Maria Muster", "maria@example.test"])(
    "removes %s from a renewal info to another member",
    async (renewedBy) => {
      queueRows = [
        { id: "info", kind: "renewal_info", payload: { to: "peter@example.test", renewedBy } },
      ];
      await removeQueuedMailsOfAccount(account);
      expect(queueRows[0].payload.renewedBy).toBe("Ein Projektmitglied");
    },
  );

  it("leaves mails of other people untouched", async () => {
    const payload = { to: "peter@example.test", renewedBy: "Anna" };
    queueRows = [{ id: "info", kind: "renewal_info", payload }];
    await removeQueuedMailsOfAccount(account);
    expect(queueRows[0].payload).toEqual(payload);
  });

  it("never blocks the account deletion", async () => {
    readError = { message: "table missing" };
    await expect(removeQueuedMailsOfAccount(account)).resolves.toBeUndefined();
    await expect(removeQueuedMailsOfAccount({ email: null })).resolves.toBeUndefined();
  });
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
