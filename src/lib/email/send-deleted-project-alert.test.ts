// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@react-email/render";

vi.mock("@/lib/supabase/serviceRole", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("./client", () => ({
  sendEmail: vi.fn(),
  getSiteUrl: () => "https://app.example.test",
  hashEmailForLog: () => "hash1234",
}));

import { sendEmail } from "./client";
import { sendDeletedProjectPaymentAlert } from "./send-deleted-project-alert";

const input = { projectId: "project-123", stripeSessionId: "cs_test_456" };

beforeEach(() => {
  vi.mocked(sendEmail).mockReset().mockResolvedValue({ ok: true, messageId: "msg", redirected: false });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sendDeletedProjectPaymentAlert", () => {
  it("tells support which project and payment are affected", async () => {
    await sendDeletedProjectPaymentAlert(input);

    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    const html = await render(mail.react);
    expect(mail.to).toBe("kontakt@narravit.de");
    expect(html).toContain("project-123");
    expect(html).toContain("cs_test_456");
  });

  it("asks for a refund when the project is finally gone", async () => {
    await sendDeletedProjectPaymentAlert({ ...input, finallyDeleted: true });

    const html = await render(vi.mocked(sendEmail).mock.calls[0][0].react);
    expect(html).toContain("endgültig gelöscht");
    expect(html).toContain("erstattet");
  });

  it("never throws when the mail fails", async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error("resend down"));

    await expect(sendDeletedProjectPaymentAlert(input)).resolves.toBeUndefined();
  });

  it("never throws when resend reports an error", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, error: "down", redirected: false, retryable: true });

    await expect(sendDeletedProjectPaymentAlert(input)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
