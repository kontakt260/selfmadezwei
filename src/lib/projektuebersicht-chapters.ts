export type Chapter = {
  id: string;
  title: string;
  source: "Erzähl-Impuls" | "Eigenes Kapitel";
  words: number;
};

export function reorderChapters(
  list: Chapter[],
  fromIndex: number,
  toIndex: number,
): Chapter[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length
  ) {
    return list;
  }
  const next = [...list];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed!);
  return next;
}

// PROJ-30: Übersicht und Editor zählen mit derselben Regel.
export { countWordsFromBody } from "./kapiteleditor/countWords";
