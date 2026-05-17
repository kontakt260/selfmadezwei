import { describe, it, expect } from "vitest";
import { reorderChapters, countWordsFromBody, type Chapter } from "./projektuebersicht-chapters";

// ─── reorderChapters ──────────────────────────────────────────────────────────

function makeChapters(...titles: string[]): Chapter[] {
  return titles.map((title, i) => ({
    id: `id-${i}`,
    title,
    source: "Eigenes Kapitel",
    words: 0,
  }));
}

describe("reorderChapters", () => {
  it("moves an item forward in the list", () => {
    const list = makeChapters("A", "B", "C", "D");
    const result = reorderChapters(list, 0, 2);
    expect(result.map((c) => c.title)).toEqual(["B", "C", "A", "D"]);
  });

  it("moves an item backward in the list", () => {
    const list = makeChapters("A", "B", "C", "D");
    const result = reorderChapters(list, 3, 1);
    expect(result.map((c) => c.title)).toEqual(["A", "D", "B", "C"]);
  });

  it("returns the same list when fromIndex === toIndex", () => {
    const list = makeChapters("A", "B", "C");
    const result = reorderChapters(list, 1, 1);
    expect(result).toBe(list); // same reference
  });

  it("returns the same list for out-of-bounds fromIndex", () => {
    const list = makeChapters("A", "B");
    expect(reorderChapters(list, -1, 0)).toBe(list);
    expect(reorderChapters(list, 5, 0)).toBe(list);
  });

  it("returns the same list for out-of-bounds toIndex", () => {
    const list = makeChapters("A", "B");
    expect(reorderChapters(list, 0, -1)).toBe(list);
    expect(reorderChapters(list, 0, 5)).toBe(list);
  });

  it("does not mutate the original array", () => {
    const list = makeChapters("A", "B", "C");
    const original = [...list];
    reorderChapters(list, 0, 2);
    expect(list.map((c) => c.title)).toEqual(original.map((c) => c.title));
  });

  it("handles a single-item list (noop)", () => {
    const list = makeChapters("A");
    expect(reorderChapters(list, 0, 0)).toBe(list);
  });
});

// ─── countWordsFromBody ───────────────────────────────────────────────────────

describe("countWordsFromBody", () => {
  it("returns 0 for null", () => {
    expect(countWordsFromBody(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(countWordsFromBody(undefined)).toBe(0);
  });

  it("returns 0 for a plain string (not a node)", () => {
    expect(countWordsFromBody("hello world")).toBe(0);
  });

  it("returns 0 for an array (not a node)", () => {
    expect(countWordsFromBody([])).toBe(0);
  });

  it("counts words in a single text node", () => {
    const node = { type: "text", text: "Hallo Welt" };
    expect(countWordsFromBody(node)).toBe(2);
  });

  it("handles leading/trailing whitespace in text nodes", () => {
    const node = { type: "text", text: "  Drei Wörter hier  " };
    expect(countWordsFromBody(node)).toBe(3);
  });

  it("returns 0 for an empty text node", () => {
    const node = { type: "text", text: "" };
    expect(countWordsFromBody(node)).toBe(0);
  });

  it("counts words across nested paragraph nodes (TipTap doc structure)", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Erster Satz." },
            { type: "text", text: " Zweiter Satz mit vier Wörtern." },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Dritter Absatz." }],
        },
      ],
    };
    // "Erster Satz." (2) + "Zweiter Satz mit vier Wörtern." (5) + "Dritter Absatz." (2) = 9
    expect(countWordsFromBody(doc)).toBe(9);
  });

  it("ignores non-text nodes with no text property", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "hardBreak" },
        { type: "text", text: "Nur diese zwei" },
      ],
    };
    expect(countWordsFromBody(doc)).toBe(3);
  });

  it("returns 0 for a doc with no content", () => {
    expect(countWordsFromBody({ type: "doc", content: [] })).toBe(0);
  });
});
