import { beforeEach, describe, expect, it, vi } from "vitest";

type QueueRow = { chapter_id: string; project_id: string; attempts: number; last_error?: string };
type Entry = { name: string; id: string | null };

const PROJECT = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const CHAPTER = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

const state = vi.hoisted(() => ({
  queue: [] as QueueRow[],
  liveChapters: [] as string[],
  trashedChapters: [] as string[],
  folders: {} as Record<string, Entry[]>,
  removed: {} as Record<string, string[]>,
  removeError: null as { message: string } | null,
  readError: null as { message: string } | null,
}));

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === "chapters" || table === "trash_chapters") {
        const ids = table === "chapters" ? state.liveChapters : state.trashedChapters;
        return {
          select: () => ({
            eq: (_column: string, id: string) => ({
              maybeSingle: async () => ({
                data: ids.includes(id) ? { id } : null,
                error: null,
              }),
            }),
          }),
        };
      }
      const read = {
        order: () => read,
        limit: () => read,
        then: (resolve: (value: unknown) => unknown) =>
          resolve(
            state.readError
              ? { data: null, error: state.readError }
              : { data: state.queue, error: null },
          ),
      };
      return {
        select: () => read,
        delete: () => ({
          eq: async (_column: string, id: string) => {
            state.queue = state.queue.filter((row) => row.chapter_id !== id);
            return { error: null };
          },
        }),
        update: (patch: Partial<QueueRow>) => ({
          eq: async (_column: string, id: string) => {
            const row = state.queue.find((entry) => entry.chapter_id === id);
            if (row) Object.assign(row, patch);
            return { error: null };
          },
        }),
      };
    },
    storage: {
      from: (bucket: string) => ({
        list: async (folder: string) => ({
          data: state.folders[`${bucket}:${folder}`] ?? [],
          error: null,
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

import { processChapterStorageCleanup } from "./storage-cleanup";

beforeEach(() => {
  state.queue = [{ chapter_id: CHAPTER, project_id: PROJECT, attempts: 0 }];
  state.liveChapters = [];
  state.trashedChapters = [];
  state.folders = {
    [`chapter-heroes:${PROJECT}/${CHAPTER}`]: [{ name: "bild.jpg", id: "f1" }],
    [`chapter-heroes:${PROJECT}`]: [
      { name: CHAPTER, id: null },
      { name: "anderes-kapitel", id: null },
    ],
    [`chapter-heroes:${PROJECT}/anderes-kapitel`]: [{ name: "bleibt.jpg", id: "f2" }],
  };
  state.removed = {};
  state.removeError = null;
  state.readError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("processChapterStorageCleanup", () => {
  it("removes only the files of this chapter and clears the entry", async () => {
    const result = await processChapterStorageCleanup();

    expect(result).toEqual({ processed: 1, cleaned: 1, failed: 0 });
    expect(state.removed).toEqual({
      "chapter-heroes": [`${PROJECT}/${CHAPTER}/bild.jpg`],
    });
    expect(state.queue).toEqual([]);
  });

  it("never touches the files of a chapter that exists again", async () => {
    state.liveChapters = [CHAPTER];

    const result = await processChapterStorageCleanup();

    expect(result.cleaned).toBe(0);
    expect(state.removed).toEqual({});
  });

  it("never touches the files of a chapter that can still be restored", async () => {
    state.trashedChapters = [CHAPTER];

    const result = await processChapterStorageCleanup();

    expect(result.cleaned).toBe(0);
    expect(state.removed).toEqual({});
  });

  it("keeps the entry for the next run when removing fails", async () => {
    state.removeError = { message: "storage down" };

    const result = await processChapterStorageCleanup();

    expect(result).toEqual({ processed: 1, cleaned: 0, failed: 1 });
    expect(state.queue[0]).toMatchObject({ attempts: 1 });
    expect(state.queue[0].last_error).toContain("storage down");
  });

  it("does nothing when the queue cannot be read", async () => {
    state.readError = { message: "db down" };

    await expect(processChapterStorageCleanup()).resolves.toEqual({
      processed: 0,
      cleaned: 0,
      failed: 0,
    });
    expect(state.removed).toEqual({});
  });
});
