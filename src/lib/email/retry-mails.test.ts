// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@react-email/render";

type Row = Record<string, unknown>;

const tables: Record<string, Row[]> = {
  mail_retry_queue: [],
  invitations: [],
  purchase_claims: [],
};
let beforeNextUpdate: (() => void) | null = null;
let readError: { message: string } | null = null;

// Kleine In-Memory-Nachbildung der Supabase-Abfragen.
function query(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let action: "select" | "update" | "delete" = "select";
  let patch: Row = {};

  const run = () => {
    if (action === "select" && readError) return { data: null, error: readError };
    const matching = tables[table].filter((row) => filters.every((f) => f(row)));
    if (action === "update") matching.forEach((row) => Object.assign(row, patch));
    if (action === "delete") tables[table] = tables[table].filter((row) => !matching.includes(row));
    return { data: matching.map((row) => ({ ...row })), error: null };
  };

  const chain = {
    select: () => chain,
    update: (values: Row) => {
      action = "update";
      patch = values;
      beforeNextUpdate?.();
      beforeNextUpdate = null;
      return chain;
    },
    delete: () => {
      action = "delete";
      return chain;
    },
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return chain;
    },
    is: (column: string, value: unknown) => {
      filters.push((row) => (row[column] ?? null) === value);
      return chain;
    },
    lt: (column: string, value: string) => {
      filters.push((row) => row[column] != null && String(row[column]) < value);
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => {
      const { data, error } = run();
      return Promise.resolve({ data: data?.[0] ?? null, error });
    },
    then: (resolve: (value: ReturnType<typeof run>) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return chain;
}

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({ from: (table: string) => query(table) }),
}));
vi.mock("./client", () => ({
  sendEmail: vi.fn(),
  getSiteUrl: () => "https://app.example.test",
  hashEmailForLog: () => "hash1234",
}));

import { hashClaimToken } from "@/lib/purchases/claim-token";
import { sendEmail } from "./client";
import { MAIL_ALERT_RECIPIENT, MAX_RETRY_ATTEMPTS, processMailRetryQueue } from "./retry-mails";

const DAY = 24 * 60 * 60 * 1000;
const inFuture = new Date(Date.now() + 30 * DAY).toISOString();

const purchasePayload = {
  to: "maria@example.test",
  amountFormatted: "249,00 €",
  paymentDateFormatted: "22. November 2026",
  expiresAtFormatted: "22. November 2027",
  giftRecipientEmail: "oma@example.test",
  buyerHasAccess: false,
};
const invitationPayload = {
  to: "oma@example.test",
  inviterName: "Maria",
  inviterEmail: "maria@example.test",
  projectName: "Lebensgeschichten",
  role: "projektleiter",
  token: "tok_123",
  isGift: true,
};
const guestPayload = {
  to: "maria@example.test",
  stripeSessionId: "cs_test_12345678",
  amountFormatted: "249,00 €",
  paymentDateFormatted: "22. November 2026",
};

function queued(kind: string, payload: Row, extra: Row = {}): Row {
  return {
    id: `row-${tables.mail_retry_queue.length + 1}`,
    kind,
    payload,
    attempts: 0,
    last_error: "resend down",
    gave_up_at: null,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

beforeEach(() => {
  tables.mail_retry_queue = [];
  tables.invitations = [];
  tables.purchase_claims = [];
  beforeNextUpdate = null;
  readError = null;
  vi.mocked(sendEmail).mockReset().mockResolvedValue({ ok: true, messageId: "msg", redirected: false });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("processMailRetryQueue", () => {
  it("sends a queued purchase mail and removes it", async () => {
    tables.mail_retry_queue.push(queued("portal_purchase", purchasePayload));

    const result = await processMailRetryQueue();

    expect(result).toEqual({ retried: 1, sent: 1, dropped: 0, gaveUp: 0 });
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe("maria@example.test");
    expect(tables.mail_retry_queue).toHaveLength(0);
  });

  it("delivers an open gift invitation", async () => {
    tables.invitations.push({ token: "tok_123", accepted_at: null, expires_at: inFuture });
    tables.mail_retry_queue.push(queued("invitation", invitationPayload));

    const result = await processMailRetryQueue();

    expect(result.sent).toBe(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe("oma@example.test");
  });

  it.each([
    ["revoked", []],
    ["accepted", [{ token: "tok_123", accepted_at: "2026-11-22T10:00:00Z", expires_at: inFuture }]],
    ["expired", [{ token: "tok_123", accepted_at: null, expires_at: "2026-01-01T00:00:00Z" }]],
  ])("does not send a %s invitation", async (_state, invitations) => {
    tables.invitations = invitations as Row[];
    tables.mail_retry_queue.push(queued("invitation", invitationPayload));

    const result = await processMailRetryQueue();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sent: 0, dropped: 1 });
    expect(tables.mail_retry_queue).toHaveLength(0);
  });

  it("creates a new claim link for a guest purchase and stores only its hash", async () => {
    tables.purchase_claims.push({
      stripe_session_id: guestPayload.stripeSessionId,
      claimed_at: null,
      mail_token_hash: "alter-hash",
    });
    tables.mail_retry_queue.push(queued("guest_purchase", guestPayload));

    await processMailRetryQueue();

    const html = await render(vi.mocked(sendEmail).mock.calls[0][0].react);
    const code = html.match(/kauf-zuordnen\?code=([A-Za-z0-9_-]{43})/)?.[1];
    expect(code).toBeDefined();
    expect(tables.purchase_claims[0].mail_token_hash).toBe(hashClaimToken(code as string));
  });

  it("skips a guest mail when the purchase is already claimed", async () => {
    tables.purchase_claims.push({
      stripe_session_id: guestPayload.stripeSessionId,
      claimed_at: "2026-11-22T10:00:00Z",
      mail_token_hash: "alter-hash",
    });
    tables.mail_retry_queue.push(queued("guest_purchase", guestPayload));

    const result = await processMailRetryQueue();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.dropped).toBe(1);
    expect(tables.purchase_claims[0].mail_token_hash).toBe("alter-hash");
  });

  it("keeps a failed mail for the next run", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, error: "still down", redirected: false, retryable: true });
    tables.mail_retry_queue.push(queued("portal_purchase", purchasePayload));

    const result = await processMailRetryQueue();

    expect(result).toEqual({ retried: 1, sent: 0, dropped: 0, gaveUp: 0 });
    expect(tables.mail_retry_queue[0]).toMatchObject({
      attempts: 1,
      last_error: "still down",
      gave_up_at: null,
    });
  });

  it("gives up after the last attempt and alerts support without personal data", async () => {
    vi.mocked(sendEmail)
      .mockResolvedValueOnce({ ok: false, error: "still down", redirected: false, retryable: true })
      .mockResolvedValue({ ok: true, messageId: "alert", redirected: false });
    tables.mail_retry_queue.push(
      queued("portal_purchase", purchasePayload, { attempts: MAX_RETRY_ATTEMPTS - 1 }),
    );

    const result = await processMailRetryQueue();

    expect(result.gaveUp).toBe(1);
    expect(tables.mail_retry_queue[0].gave_up_at).toEqual(expect.any(String));
    const alert = vi.mocked(sendEmail).mock.calls[1][0];
    expect(alert.to).toBe(MAIL_ALERT_RECIPIENT);
    const html = await render(alert.react);
    expect(html).toContain("Kaufbest");
    expect(html).not.toContain("maria@example.test");
    expect(html).not.toContain("oma@example.test");
  });

  it("does not retry or alert again for a mail it gave up on", async () => {
    tables.mail_retry_queue.push(
      queued("portal_purchase", purchasePayload, {
        attempts: MAX_RETRY_ATTEMPTS,
        gave_up_at: new Date().toISOString(),
      }),
    );

    const result = await processMailRetryQueue();

    expect(result.retried).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(tables.mail_retry_queue).toHaveLength(1);
  });

  it("deletes given-up mails after 30 days", async () => {
    tables.mail_retry_queue.push(
      queued("portal_purchase", purchasePayload, {
        attempts: MAX_RETRY_ATTEMPTS,
        gave_up_at: new Date(Date.now() - 31 * DAY).toISOString(),
      }),
    );

    await processMailRetryQueue();

    expect(tables.mail_retry_queue).toHaveLength(0);
  });

  it("does not send when a parallel run claimed the mail first", async () => {
    const row = queued("portal_purchase", purchasePayload);
    tables.mail_retry_queue.push(row);
    beforeNextUpdate = () => {
      row.attempts = 1;
    };

    const result = await processMailRetryQueue();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.retried).toBe(0);
  });

  it("returns quietly when the queue cannot be read", async () => {
    readError = { message: "relation does not exist" };
    await expect(processMailRetryQueue()).resolves.toEqual({
      retried: 0,
      sent: 0,
      dropped: 0,
      gaveUp: 0,
    });
  });
});
