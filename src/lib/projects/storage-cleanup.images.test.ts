import { beforeEach, describe, expect, it, vi } from "vitest";

type QueueRow = {
  storage_path: string;
  chapter_id: string;
  project_id: string;
  delete_after: string;
  attempts: number;
  last_error?: string;
};

const PROJECT = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const CHAPTER = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const FILE = `${PROJECT}/${CHAPTER}/foto.jpg`;
const PAST = "2026-01-01T00:00:00.000Z";
const FUTURE = "2999-01-01T00:00:00.000Z";

const state = vi.hoisted(() => ({
  queue: [] as QueueRow[],
  liveSections: [] as unknown[],
  trashedSections: [] as unknown[],
  removed: [] as string[],
  removeError: null as { message: string } | null,
  readError: null as { message: string } | null,
  checkError: null as { message: string } | null,
}));

vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === "chapters" || table === "trash_chapters") {
        const rows = (table === "chapters" ? state.liveSections : state.trashedSections).map(
          (image_sections) => ({ image_sections }),
        );
        const read = {
          in: () => read,
          limit: async () =>
            state.checkError ? { data: null, error: state.checkError } : { data: rows, error: null },
        };
        return { select: () => read };
      }

      let dueBefore = "";
      const read = {
        lte: (_column: string, value: string) => {
          dueBefore = value;
          return read;
        },
        order: () => read,
        limit: async () =>
          state.readError
            ? { data: null, error: state.readError }
            : {
                data: state.queue.filter((row) => row.delete_after <= dueBefore),
                error: null,
              },
      };
      return {
        select: () => read,
        delete: () => ({
          in: async (_column: string, paths: string[]) => {
            state.queue = state.queue.filter((row) => !paths.includes(row.storage_path));
            return { error: null };
          },
        }),
        update: (patch: Partial<QueueRow>) => ({
          eq: async (_column: string, path: string) => {
            const row = state.queue.find((entry) => entry.storage_path === path);
            if (row) Object.assign(row, patch);
            return { error: null };
          },
        }),
      };
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          if (state.removeError) return { error: state.removeError };
          state.removed.push(...paths);
          return { error: null };
        },
      }),
    },
  }),
}));

import { processImageStorageCleanup } from "./storage-cleanup";

function row(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    storage_path: FILE,
    chapter_id: CHAPTER,
    project_id: PROJECT,
    delete_after: PAST,
    attempts: 0,
    ...overrides,
  };
}

function sectionsWith(path: string) {
  return {
    start: { layout: "1-spaltig", images: [] },
    end: { layout: "1-spaltig", images: [] },
    inline: {
      "cccccccc-cccc-4ccc-accc-cccccccccccc": {
        layout: "1-spaltig",
        images: [{ id: "foto", storage_path: path }],
      },
    },
  };
}

beforeEach(() => {
  state.queue = [row()];
  state.liveSections = [];
  state.trashedSections = [];
  state.removed = [];
  state.removeError = null;
  state.readError = null;
  state.checkError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("processImageStorageCleanup", () => {
  it("deletes a due photo and clears its entry", async () => {
    await expect(processImageStorageCleanup()).resolves.toEqual({
      processed: 1,
      cleaned: 1,
      failed: 0,
    });
    expect(state.removed).toEqual([FILE]);
    expect(state.queue).toEqual([]);
  });

  it("does not touch a photo before its 14 days are over", async () => {
    state.queue = [row({ delete_after: FUTURE })];

    await expect(processImageStorageCleanup()).resolves.toEqual({
      processed: 0,
      cleaned: 0,
      failed: 0,
    });
    expect(state.removed).toEqual([]);
    expect(state.queue).toHaveLength(1);
  });

  it("keeps a photo the saved chapter uses again", async () => {
    state.liveSections = [sectionsWith(FILE)];

    const result = await processImageStorageCleanup();

    expect(result).toEqual({ processed: 1, cleaned: 0, failed: 0 });
    expect(state.removed).toEqual([]);
    expect(state.queue).toEqual([]);
  });

  it("keeps a photo a deleted chapter would need when restored", async () => {
    state.trashedSections = [sectionsWith(FILE)];

    const result = await processImageStorageCleanup();

    expect(result.cleaned).toBe(0);
    expect(state.removed).toEqual([]);
  });

  it("deletes nothing when the check cannot run", async () => {
    state.checkError = { message: "db down" };

    await expect(processImageStorageCleanup()).resolves.toEqual({
      processed: 0,
      cleaned: 0,
      failed: 0,
    });
    expect(state.removed).toEqual([]);
    expect(state.queue).toHaveLength(1);
  });

  it("never deletes a file outside the own chapter folder", async () => {
    const foreign = `${PROJECT}/dddddddd-dddd-4ddd-addd-dddddddddddd/fremd.jpg`;
    const escaped = `${PROJECT}/${CHAPTER}/../fremd.jpg`;
    state.queue = [row({ storage_path: foreign }), row({ storage_path: escaped })];

    const result = await processImageStorageCleanup();

    expect(result.cleaned).toBe(0);
    expect(state.removed).toEqual([]);
    expect(state.queue).toEqual([]);
  });

  it("keeps the entry for the next run when deleting fails", async () => {
    state.removeError = { message: "storage down" };

    const result = await processImageStorageCleanup();

    expect(result).toEqual({ processed: 1, cleaned: 0, failed: 1 });
    expect(state.queue[0]).toMatchObject({ attempts: 1 });
    expect(state.queue[0].last_error).toContain("storage down");
  });

  it("does nothing when the list cannot be read", async () => {
    state.readError = { message: "db down" };

    await expect(processImageStorageCleanup()).resolves.toEqual({
      processed: 0,
      cleaned: 0,
      failed: 0,
    });
    expect(state.removed).toEqual([]);
  });

  it("deletes in small batches", async () => {
    state.queue = Array.from({ length: 60 }, (_, index) =>
      row({ storage_path: `${PROJECT}/${CHAPTER}/foto-${index}.jpg` }),
    );

    const result = await processImageStorageCleanup();

    expect(result).toEqual({ processed: 60, cleaned: 60, failed: 0 });
    expect(state.removed).toHaveLength(60);
    expect(state.queue).toEqual([]);
  });
});
