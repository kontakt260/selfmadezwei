import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const rpcMock = vi.hoisted(() => vi.fn());
const holdResult = vi.hoisted(() => ({
  current: { data: null, error: null } as {
    data: { hold_until: string } | null;
    error: { message: string } | null;
  },
}));

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      gt: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => holdResult.current,
    };
    return { rpc: rpcMock, from: () => chain };
  },
}));

import {
  getRetentionHoldUntil,
  isProjectInTrash,
  purgeDueTrash,
  restorePaidProject,
} from "./trash";

function clientWith(result: { data: unknown; error: { message: string } | null }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result,
  };
  return { from: () => chain } as unknown as SupabaseClient<Database>;
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe("purgeDueTrash", () => {
  it("returns how much was finally deleted", async () => {
    rpcMock.mockResolvedValue({ data: { projects: 1, chapters: 3 }, error: null });

    await expect(purgeDueTrash()).resolves.toEqual({ projects: 1, chapters: 3 });
    expect(rpcMock).toHaveBeenCalledWith("trash_purge_due");
  });

  it("throws on a database error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "db down" } });

    await expect(purgeDueTrash()).rejects.toThrow("db down");
  });

  it("rejects an unexpected answer", async () => {
    rpcMock.mockResolvedValue({ data: { projects: "viele" }, error: null });

    await expect(purgeDueTrash()).rejects.toThrow();
  });
});

describe("restorePaidProject (PROJ-28)", () => {
  const client = { rpc: rpcMock } as unknown as SupabaseClient<Database>;

  it.each(["restored", "not_in_trash", "gone", "deleted_by_customer", "not_paid", "lead_required"])(
    "returns %s",
    async (status) => {
      rpcMock.mockResolvedValue({ data: { status }, error: null });

      await expect(restorePaidProject(client, "p1")).resolves.toBe(status);
      expect(rpcMock).toHaveBeenCalledWith("retention_restore_paid", { p_project_id: "p1" });
    },
  );

  it("throws on a database error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "db down" } });

    await expect(restorePaidProject(client, "p1")).rejects.toThrow("db down");
  });

  it("rejects an unknown answer", async () => {
    rpcMock.mockResolvedValue({ data: { status: "vielleicht" }, error: null });

    await expect(restorePaidProject(client, "p1")).rejects.toThrow();
  });
});

describe("getRetentionHoldUntil (PROJ-28)", () => {
  it("returns the date of an active hold", async () => {
    holdResult.current = { data: { hold_until: "2026-12-07T10:00:00Z" }, error: null };

    await expect(getRetentionHoldUntil("p1")).resolves.toBe("2026-12-07T10:00:00Z");
  });

  it("is null without a hold", async () => {
    holdResult.current = { data: null, error: null };

    await expect(getRetentionHoldUntil("p1")).resolves.toBeNull();
  });

  it("falls back to null on a database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    holdResult.current = { data: null, error: { message: "db down" } };

    await expect(getRetentionHoldUntil("p1")).resolves.toBeNull();
  });
});

describe("isProjectInTrash", () => {
  it("is true for a deleted project", async () => {
    const client = clientWith({ data: { project_id: "p1" }, error: null });

    await expect(isProjectInTrash(client, "p1")).resolves.toBe(true);
  });

  it("is false for a normal project", async () => {
    const client = clientWith({ data: null, error: null });

    await expect(isProjectInTrash(client, "p1")).resolves.toBe(false);
  });

  it("throws on a database error instead of guessing", async () => {
    const client = clientWith({ data: null, error: { message: "db down" } });

    await expect(isProjectInTrash(client, "p1")).rejects.toThrow("db down");
  });
});
