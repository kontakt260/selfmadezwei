import { describe, it, expect, vi } from "vitest";
import { sendInBackground } from "./background";

// Außerhalb eines Requests (hier: Unit-Test) wirft Next' `after()`.
// sendInBackground startet den Versand dann direkt und fängt Fehler ab.

describe("sendInBackground", () => {
  it("runs the task when called outside a request scope", async () => {
    const task = vi.fn(async () => undefined);
    sendInBackground("test", task);
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("logs instead of throwing when the task fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendInBackground("test", async () => {
      throw new Error("resend down");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[email/test] background send failed: resend down"),
    );
    errorSpy.mockRestore();
  });
});
