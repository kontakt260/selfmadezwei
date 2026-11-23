import { describe, expect, it } from "vitest";
import { EMPTY_IMAGE_SECTIONS, type ChapterDraft } from "./types";
import { planChapterSave, type SavedChapterState } from "./save-plan";

const body = { type: "doc", content: [] };
const saved: SavedChapterState = {
  title: "Kindheit",
  body,
  imageSections: EMPTY_IMAGE_SECTIONS,
  pageCount: 3,
};
const draft = (patch: Partial<ChapterDraft> = {}): ChapterDraft => ({
  title: saved.title,
  body: saved.body,
  imageSections: saved.imageSections,
  colorPageCount: 0,
  pageCount: undefined,
  ...patch,
});

describe("planChapterSave", () => {
  it("schreibt beim bloßen Öffnen nichts", () => {
    expect(planChapterSave(draft(), saved)).toBe("none");
    expect(planChapterSave(draft({ pageCount: 3 }), saved)).toBe("none");
  });

  it("schreibt bei abweichender Seitenzahl nur die Seitenzahl", () => {
    expect(planChapterSave(draft({ pageCount: 4 }), saved)).toBe("page-count");
  });

  it("speichert Text, Titel und Bilder nur nach einer echten Änderung", () => {
    expect(planChapterSave(draft({ body: { ...body } }), saved)).toBe("content");
    expect(planChapterSave(draft({ title: "Jugend" }), saved)).toBe("content");
    expect(
      planChapterSave(draft({ imageSections: { ...EMPTY_IMAGE_SECTIONS } }), saved),
    ).toBe("content");
  });
});
