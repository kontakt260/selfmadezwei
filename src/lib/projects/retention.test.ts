import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());
const alertMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({ rpc: rpcMock }),
}));
vi.mock("@/lib/email/send-retention-brake-alert", () => ({
  sendRetentionBrakeAlert: alertMock,
}));

import { moveExpiredProjectsToTrash, RETENTION_MAX_PER_RUN } from "./retention";

const normalRun = { due: 2, moved: 2, skipped: 0, failed: 0, braked: false };

beforeEach(() => {
  rpcMock.mockReset();
  alertMock.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("moveExpiredProjectsToTrash", () => {
  it("returns what the run moved and sends no alert", async () => {
    rpcMock.mockResolvedValue({ data: normalRun, error: null });

    await expect(moveExpiredProjectsToTrash()).resolves.toEqual(normalRun);
    expect(rpcMock).toHaveBeenCalledWith("retention_move_due");
    expect(alertMock).not.toHaveBeenCalled();
  });

  it("alerts support when the brake holds the run", async () => {
    const braked = { due: 73, moved: 0, skipped: 0, failed: 0, braked: true };
    rpcMock.mockResolvedValue({ data: braked, error: null });

    await expect(moveExpiredProjectsToTrash()).resolves.toEqual(braked);
    expect(alertMock).toHaveBeenCalledWith({ due: 73, limit: RETENTION_MAX_PER_RUN });
  });

  it("logs failed projects without an alert", async () => {
    rpcMock.mockResolvedValue({
      data: { due: 2, moved: 1, skipped: 0, failed: 1, braked: false },
      error: null,
    });

    await moveExpiredProjectsToTrash();

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("1 project(s)"));
    expect(alertMock).not.toHaveBeenCalled();
  });

  it("throws on a database error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "db down" } });

    await expect(moveExpiredProjectsToTrash()).rejects.toThrow("db down");
  });

  it("rejects an unexpected answer", async () => {
    rpcMock.mockResolvedValue({ data: { moved: "viele" }, error: null });

    await expect(moveExpiredProjectsToTrash()).rejects.toThrow();
    expect(alertMock).not.toHaveBeenCalled();
  });
});
