import { beforeEach, describe, expect, it, vi } from "vitest";

// PROJ-32 Schritt 3: Liste und Inhalt für den Neusatz im Browser.

const PROJECT = "cccccccc-0032-4032-8032-000000000032";
const CH = (n: number) => `dddddddd-0032-4032-8032-00000000000${n}`;

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  project: { book_font: "garamond" } as { book_font: string } | null,
  expiresAt: "2099-01-01T00:00:00Z" as string | null,
  chapters: [] as Array<{ id: string; page_count_font: string | null }>,
  chapter: null as Record<string, unknown> | null,
  error: null as { message: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      const result = () => {
        if (table === "projects") return { data: state.project, error: state.error };
        if (table === "project_access") return { data: { expires_at: state.expiresAt }, error: null };
        return { data: state.chapter, error: state.error };
      };
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: async () => ({ data: state.chapters, error: state.error }),
        maybeSingle: async () => result(),
      };
      return builder;
    },
  }),
}));

import { pageCountQueueAction, typesetChapterAction } from "./page-count-actions";

beforeEach(() => {
  state.user = { id: "u1" };
  state.project = { book_font: "garamond" };
  state.expiresAt = "2099-01-01T00:00:00Z";
  state.chapters = [];
  state.chapter = null;
  state.error = null;
});

describe("pageCountQueueAction", () => {
  it("nennt die Kapitel mit einer Seitenzahl aus einer anderen Schrift, in Buchreihenfolge", async () => {
    state.chapters = [
      { id: CH(1), page_count_font: "garamond" },
      { id: CH(2), page_count_font: null },
      { id: CH(3), page_count_font: "heros" },
    ];
    await expect(pageCountQueueAction({ projectId: PROJECT })).resolves.toEqual({
      queue: { bookFont: "garamond", chapterIds: [CH(2), CH(3)] },
    });
  });

  it("wertet Kapitel ohne Angabe bei PT Serif als aktuell", async () => {
    state.project = { book_font: "pt-serif" };
    state.chapters = [
      { id: CH(1), page_count_font: null },
      { id: CH(2), page_count_font: "pt-serif" },
    ];
    await expect(pageCountQueueAction({ projectId: PROJECT })).resolves.toEqual({
      queue: { bookFont: "pt-serif", chapterIds: [] },
    });
  });

  it("setzt im Lesemodus nichts neu", async () => {
    state.expiresAt = "2020-01-01T00:00:00Z";
    state.chapters = [{ id: CH(1), page_count_font: null }];
    await expect(pageCountQueueAction({ projectId: PROJECT })).resolves.toEqual({
      queue: { bookFont: "garamond", chapterIds: [] },
    });
  });

  it("verlangt Anmeldung und Mitgliedschaft", async () => {
    state.user = null;
    await expect(pageCountQueueAction({ projectId: PROJECT })).resolves.toEqual({ error: "Nicht angemeldet." });
    state.user = { id: "u1" };
    state.project = null;
    await expect(pageCountQueueAction({ projectId: PROJECT })).resolves.toEqual({
      error: "Projekt nicht gefunden.",
    });
  });

  it("meldet Datenbankfehler und ungültige IDs", async () => {
    state.error = { message: "boom" };
    expect((await pageCountQueueAction({ projectId: PROJECT })).error).toBeTruthy();
    expect((await pageCountQueueAction({ projectId: "x" })).error).toBe("Ungültige Eingabe.");
  });
});

describe("typesetChapterAction", () => {
  it("liefert das Kapitel wie beim Öffnen im Editor, ohne Trennzeichen", async () => {
    state.chapter = {
      title: "Kindheit",
      body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Groß­mut­ter" }] }] },
      image_sections: { start: { layout: "1-spaltig", images: [] }, end: { layout: "1-spaltig", images: [] } },
      updated_at: "2026-11-24T20:00:00.123456+00:00",
    };
    const result = await typesetChapterAction({ projectId: PROJECT, chapterId: CH(1) });
    expect(result.chapter?.title).toBe("Kindheit");
    expect(result.chapter?.updatedAt).toBe("2026-11-24T20:00:00.123456+00:00");
    expect(JSON.stringify(result.chapter?.body)).toContain("Großmutter");
    expect(JSON.stringify(result.chapter?.body)).not.toContain("­");
    expect(result.chapter?.imageSections.placed).toBe(true);
  });

  it("meldet fehlende Kapitel und fehlende Anmeldung", async () => {
    await expect(typesetChapterAction({ projectId: PROJECT, chapterId: CH(1) })).resolves.toEqual({
      error: "Kapitel nicht gefunden.",
    });
    state.user = null;
    await expect(typesetChapterAction({ projectId: PROJECT, chapterId: CH(1) })).resolves.toEqual({
      error: "Nicht angemeldet.",
    });
  });
});
