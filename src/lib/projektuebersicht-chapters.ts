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

/** Extracts word count from a TipTap/ProseMirror JSON body. */
export function countWordsFromBody(body: unknown): number {
  if (!body || typeof body !== "object" || Array.isArray(body)) return 0;
  const node = body as { type?: string; text?: string; content?: unknown[] };
  let count = 0;
  if (node.type === "text" && node.text) {
    count += node.text.trim().split(/\s+/).filter(Boolean).length;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      count += countWordsFromBody(child);
    }
  }
  return count;
}
