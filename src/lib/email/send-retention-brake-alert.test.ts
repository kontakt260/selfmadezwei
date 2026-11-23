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
import { sendRetentionBrakeAlert } from "./send-retention-brake-alert";

beforeEach(() => {
  vi.mocked(sendEmail).mockReset().mockResolvedValue({ ok: true, messageId: "msg", redirected: false });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sendRetentionBrakeAlert", () => {
  it("tells support the numbers and where the steps are", async () => {
    await sendRetentionBrakeAlert({ due: 73, limit: 50 });

    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    const html = await render(mail.react);
    expect(mail.to).toBe("kontakt@narravit.de");
    expect(html).toContain("73");
    expect(html).toContain("50");
    expect(html).toContain("support-papierkorb.md");
  });

  it("never throws when sending fails", async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("resend down"));

    await expect(sendRetentionBrakeAlert({ due: 73, limit: 50 })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
