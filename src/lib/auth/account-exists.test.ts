// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({ rpc }),
}));

import { accountExists } from "./account-exists";

const email = "maria@example.test";

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("accountExists", () => {
  it("reports an existing account", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(accountExists(email)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("account_exists", { p_email: email });
  });

  it("reports an unknown address", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(accountExists(email)).resolves.toBe(false);
  });

  it("stays undecided on a database error and does not log the address", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function not found" } });
    await expect(accountExists(email)).resolves.toBeNull();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(email);
  });

  it("stays undecided on an empty answer", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(accountExists(email)).resolves.toBeNull();
  });

  it("never throws", async () => {
    rpc.mockRejectedValue(new Error("network down"));
    await expect(accountExists(email)).resolves.toBeNull();
  });
});
