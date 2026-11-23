import type { ChapterDraft, ImageSections } from "./types";

// PROJ-30: Was beim automatischen Speichern wirklich geschrieben werden darf.
//
// Der Editor meldet nach dem Öffnen die berechnete Seitenzahl. Früher ging
// dabei der geladene Text mit zum Server. War er nicht mehr aktuell, hat allein
// das Öffnen eines Kapitels neueren Text überschrieben. Text, Titel und Bilder
// werden deshalb nur gespeichert, wenn die Person sie wirklich geändert hat.

export type SavedChapterState = {
  title: string;
  body: unknown;
  imageSections: ImageSections;
  pageCount: number;
};

export type ChapterSavePlan = "none" | "page-count" | "content";

export function planChapterSave(draft: ChapterDraft, saved: SavedChapterState): ChapterSavePlan {
  const contentChanged =
    draft.title !== saved.title ||
    !Object.is(draft.body, saved.body) ||
    !Object.is(draft.imageSections, saved.imageSections);
  if (contentChanged) return "content";
  if (draft.pageCount === undefined || draft.pageCount === saved.pageCount) return "none";
  return "page-count";
}
