import { beforeEach, describe, expect, it, vi } from "vitest";

type QueueRow = { project_id: string; attempts: number; last_error?: string };
type Entry = { name: string; id: string | null };

const PROJECT = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";

const state = vi.hoisted(() => ({
  queue: [] as QueueRow[],
  existingProjects: [] as string[],
  folders: {} as Record<string, Entry[]>,
  removed: {} as Record<string, string[]>,
  listError: null as { message: string } | null,
  removeError: null as { message: string } | null,
  queueFilter: null as string[] | null,
}));

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === "projects") {
        return {
          select: () => ({
            eq: (_column: string, id: string) => ({
              maybeSingle: async () => ({
                data: state.existingProjects.includes(id) ? { id } : null,
                error: null,
              }),
            }),
          }),
        };
      }
      const read = {
        order: () => read,
        limit: () => read,
        in: (_column: string, ids: string[]) => {
          state.queueFilter = ids;
          return read;
        },
        then: (resolve: (value: { data: QueueRow[]; error: null }) => unknown) =>
          resolve({
            data: state.queue.filter(
              (row) => !state.queueFilter || state.queueFilter.includes(row.project_id),
            ),
            error: null,
          }),
      };
      return {
        select: () => read,
        delete: () => ({
          eq: async (_column: string, id: string) => {
            state.queue = state.queue.filter((row) => row.project_id !== id);
            return { error: null };
          },
        }),
        update: (patch: Partial<QueueRow>) => ({
          eq: async (_column: string, id: string) => {
            const row = state.queue.find((entry) => entry.project_id === id);
            if (row) Object.assign(row, patch);
            return { error: null };
          },
        }),
      };
    },
    storage: {
      from: (bucket: string) => ({
        list: async (folder: string) => ({
          data: state.listError ? null : (state.folders[`${bucket}:${folder}`] ?? []),
          error: state.listError,
        }),
        remove: async (paths: string[]) => {
          if (state.removeError) return { error: state.removeError };
          state.removed[bucket] = [...(state.removed[bucket] ?? []), ...paths];
          return { error: null };
        },
      }),
    },
  }),
}));

import { processStorageCleanup } from "./storage-cleanup";

beforeEach(() => {
  state.queue = [{ project_id: PROJECT, attempts: 0 }];
  state.existingProjects = [];
  state.folders = {};
  state.removed = {};
  state.listError = null;
  state.removeError = null;
  state.queueFilter = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("processStorageCleanup", () => {
  it("removes files in nested folders of every bucket and clears the entry", async () => {
    state.folders[`chapter-heroes:${PROJECT}`] = [{ name: "chapter-1", id: null }];
    state.folders[`chapter-heroes:${PROJECT}/chapter-1`] = [{ name: "bild.jpg", id: "f1" }];
    state.folders[`project-covers:${PROJECT}`] = [{ name: "cover.png", id: "f2" }];

    const result = await processStorageCleanup();

    expect(result).toEqual({ processed: 1, cleaned: 1, failed: 0 });
    expect(state.removed).toEqual({
      "chapter-heroes": [`${PROJECT}/chapter-1/bild.jpg`],
      "project-covers": [`${PROJECT}/cover.png`],
    });
    expect(state.queue).toEqual([]);
  });

  it("never touches the files of a project that still exists", async () => {
    state.existingProjects = [PROJECT];
    state.folders[`project-covers:${PROJECT}`] = [{ name: "cover.png", id: "f2" }];

    const result = await processStorageCleanup();

    expect(result.cleaned).toBe(0);
    expect(state.removed).toEqual({});
    expect(state.queue).toEqual([]);
  });

  it("keeps the entry for the next run when removing fails", async () => {
    state.folders[`project-covers:${PROJECT}`] = [{ name: "cover.png", id: "f2" }];
    state.removeError = { message: "storage down" };

    const result = await processStorageCleanup();

    expect(result).toEqual({ processed: 1, cleaned: 0, failed: 1 });
    expect(state.queue[0]).toMatchObject({ attempts: 1 });
    expect(state.queue[0].last_error).toContain("storage down");
  });

  it("does nothing for an empty list of projects", async () => {
    await expect(processStorageCleanup([])).resolves.toEqual({
      processed: 0,
      cleaned: 0,
      failed: 0,
    });
    expect(state.queue).toHaveLength(1);
  });
});
