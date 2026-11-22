import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const rpcMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({ rpc: rpcMock }),
}));

import { isProjectInTrash, purgeDueTrash } from "./trash";

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
