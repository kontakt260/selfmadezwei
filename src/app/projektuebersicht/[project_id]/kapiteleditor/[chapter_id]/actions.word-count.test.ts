import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT = "cccccccc-0099-0099-0099-000000000099";
const CHAPTER = "dddddddd-0099-4099-8099-000000000099";

const state = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  filters: [] as Array<Array<[string, unknown]>>,
  firstResult: { data: [] as unknown[], error: null as { message: string } | null },
  bookFont: "pt-serif",
}));

vi.mock("@/lib/projects/project-access", () => ({
  projectWriteBlockedError: async () => null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({
      // PROJ-32: Buchschrift des Projekts.
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { book_font: state.bookFont }, error: null }) }),
      }),
      update: (values: Record<string, unknown>) => {
        state.updates.push(values);
        const index = state.updates.length - 1;
        state.filters[index] = [];
        const builder = {
          eq: (column: string, value: unknown) => {
            state.filters[index].push([column, value]);
            return builder;
          },
          select: async () => state.firstResult,
          then: (resolve: (result: { error: null }) => void) => resolve({ error: null }),
        };
        return builder;
      },
    }),
  }),
}));

import { chapterAutosaveAction, chapterPageCountAction } from "./actions";

const body = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "eins zwei drei" }] }],
};
const input = {
  projectId: PROJECT,
  chapterId: CHAPTER,
  title: "Kindheit",
  body,
  imageSections: {
    start: { layout: "1-spaltig" as const, images: [] },
    end: { layout: "1-spaltig" as const, images: [] },
  },
  colorPageCount: 0,
};

beforeEach(() => {
  state.updates.length = 0;
  state.filters.length = 0;
  state.bookFont = "pt-serif";
  state.firstResult = {
    data: [{ id: CHAPTER, word_count: 3, updated_at: "2026-11-23T10:00:00Z" }],
    error: null,
  };
});

describe("chapterAutosaveAction — Wortzahl (PROJ-30)", () => {
  it("zählt selbst und speichert die Zahl mit dem Text", async () => {
    await expect(chapterAutosaveAction(input)).resolves.toEqual({ ok: true });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ body, word_count: 3 });
  });

  it("trägt die Zahl nach, wenn die Datenbank sie geleert hat", async () => {
    state.firstResult = {
      data: [{ id: CHAPTER, word_count: null, updated_at: "2026-11-23T10:00:00Z" }],
      error: null,
    };
    await chapterAutosaveAction(input);
    expect(state.updates[1]).toEqual({ word_count: 3 });
    expect(state.filters[1]).toContainEqual(["updated_at", "2026-11-23T10:00:00Z"]);
  });

  it("meldet weiter einen Fehler, wenn nichts gespeichert wurde", async () => {
    state.firstResult = { data: [], error: null };
    await expect(chapterAutosaveAction(input)).resolves.toEqual({
      error: "Speichern fehlgeschlagen.",
    });
    expect(state.updates).toHaveLength(1);
  });
});

describe("chapterAutosaveAction — Seitenzahl und Buchschrift (PROJ-32)", () => {
  it("speichert Text und Seitenzahl, wenn die Schrift zur Buchschrift passt", async () => {
    state.bookFont = "pagella";
    await expect(
      chapterAutosaveAction({ ...input, pageCount: 6, pageCountFont: "pagella" }),
    ).resolves.toEqual({ ok: true });
    expect(state.updates[0]).toMatchObject({ page_count: 6, page_count_font: "pagella" });
  });

  it("speichert den Text, aber nicht die Seitenzahl einer alten Schrift", async () => {
    state.bookFont = "heros";
    await expect(
      chapterAutosaveAction({ ...input, pageCount: 6, pageCountFont: "pt-serif" }),
    ).resolves.toEqual({ ok: true, bookFont: "heros" });
    expect(state.updates[0]).toMatchObject({ body, word_count: 3 });
    expect(state.updates[0]).not.toHaveProperty("page_count");
    expect(state.updates[0]).not.toHaveProperty("page_count_font");
  });
});

describe("chapterPageCountAction (PROJ-30)", () => {
  it("schreibt nur die Seitenzahl", async () => {
    state.firstResult = { data: [{ id: CHAPTER }], error: null };
    await expect(
      chapterPageCountAction({ projectId: PROJECT, chapterId: CHAPTER, pageCount: 4 }),
    ).resolves.toEqual({ ok: true });
    expect(state.updates).toEqual([{ page_count: 4, page_count_font: "pt-serif" }]);
  });

  it("PROJ-32: speichert die Schrift mit, mit der gemessen wurde", async () => {
    state.firstResult = { data: [{ id: CHAPTER }], error: null };
    state.bookFont = "garamond";
    await expect(
      chapterPageCountAction({ projectId: PROJECT, chapterId: CHAPTER, pageCount: 5, pageCountFont: "garamond" }),
    ).resolves.toEqual({ ok: true });
    expect(state.updates).toEqual([{ page_count: 5, page_count_font: "garamond" }]);
  });

  it("PROJ-32: nimmt keine Seitenzahl an, die mit einer anderen Schrift gemessen wurde", async () => {
    state.bookFont = "garamond";
    await expect(
      chapterPageCountAction({ projectId: PROJECT, chapterId: CHAPTER, pageCount: 4, pageCountFont: "pt-serif" }),
    ).resolves.toEqual({ ok: true, bookFont: "garamond" });
    // Ohne Angabe (alter Client) gilt PT Serif.
    await expect(
      chapterPageCountAction({ projectId: PROJECT, chapterId: CHAPTER, pageCount: 4 }),
    ).resolves.toEqual({ ok: true, bookFont: "garamond" });
    expect(state.updates).toHaveLength(0);
  });

  it("PROJ-32 Neusatz: speichert nur, wenn das Kapitel seit dem Laden unverändert ist", async () => {
    state.firstResult = { data: [{ id: CHAPTER }], error: null };
    await expect(
      chapterPageCountAction({
        projectId: PROJECT,
        chapterId: CHAPTER,
        pageCount: 5,
        ifUnchangedSince: "2026-11-24T20:00:00.123456+00:00",
      }),
    ).resolves.toEqual({ ok: true });
    expect(state.filters[0]).toContainEqual(["updated_at", "2026-11-24T20:00:00.123456+00:00"]);

    // Inzwischen geändert: Die Datenbank findet keine Zeile, nichts gilt als gespeichert.
    state.firstResult = { data: [], error: null };
    const changed = await chapterPageCountAction({
      projectId: PROJECT,
      chapterId: CHAPTER,
      pageCount: 5,
      ifUnchangedSince: "2026-11-24T20:00:00.123456+00:00",
    });
    expect(changed.error).toBeTruthy();
  });

  it("PROJ-32: lehnt unbekannte Schriften ab", async () => {
    const result = await chapterPageCountAction({
      projectId: PROJECT,
      chapterId: CHAPTER,
      pageCount: 4,
      pageCountFont: "comic-sans" as never,
    });
    expect(result.error).toBeTruthy();
    expect(state.updates).toHaveLength(0);
  });

  it("lehnt ungültige Werte ab", async () => {
    const result = await chapterPageCountAction({ projectId: PROJECT, chapterId: CHAPTER, pageCount: 0 });
    expect(result.error).toBeTruthy();
    expect(state.updates).toHaveLength(0);
  });
});
