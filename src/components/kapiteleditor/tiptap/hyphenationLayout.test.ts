import { afterEach, describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { editorExtensions } from "./extensions";
import { HYPHEN_CLASS, HYPHENATION_SUPPRESS, hyphenationKey, hyphenationSuppressed } from "./Hyphenation";
import { MAX_HYPHENATED_LINES, overlongRunIndex } from "./hyphenationLayout";
import { loadHyphenation } from "@/lib/hyphenation";

describe("overlongRunIndex (AC-8: höchstens 3 getrennte Zeilen in Folge)", () => {
  it.each([
    [[], -1],
    [[0, 1, 2], -1],
    [[0, 1, 2, 3], 3],
    [[0, 2, 4, 6, 8], -1],
    [[0, 1, 2, 4, 5, 6], -1],
    [[1, 2, 3, 4, 5, 6], 3],
    [[0, 3, 4, 5, 6], 4],
  ])("Zeilen %j → %i", (lines, expected) => {
    expect(overlongRunIndex(lines)).toBe(expected);
  });

  it("nutzt drei als Grenze", () => {
    expect(MAX_HYPHENATED_LINES).toBe(3);
  });
});

// In jsdom gibt es kein Layout, die Pagination bleibt außen vor.
const extensions = editorExtensions.filter((e) => e.name !== "paginationDecorations");
const para = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
const A = "Meine Großmutter erzählte uns Geschichten aus ihrer Kindheit am Bodensee.";
const B = "Die Schreinerei meines Vaters lag gegenüber der Dorfkirche.";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

async function ready(...paragraphs: string[]) {
  const instance = new Editor({ extensions, content: { type: "doc", content: paragraphs.map(para) } });
  editor = instance;
  await new Promise<void>((resolve) => instance.on("create", () => resolve()));
  await loadHyphenation();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return instance;
}
const widgetPositions = (e: Editor) =>
  hyphenationKey
    .getState(e.state)!
    .set.find()
    .map((d) => d.from)
    .sort((a, b) => a - b);

describe("Abschalten einzelner Trennstellen durch den Seiten-Takt", () => {
  it("ordnet jede Markierung im DOM ihrer Textposition zu", async () => {
    const e = await ready(A);
    const elements = Array.from(e.view.dom.querySelectorAll<HTMLElement>(`.${HYPHEN_CLASS}`));
    expect(elements.length).toBe(widgetPositions(e).length);
    expect(elements.map((el) => e.view.posAtDOM(el, 0))).toEqual(widgetPositions(e));
  });

  it("entfernt abgeschaltete Markierungen und bringt sie wieder", async () => {
    const e = await ready(A, B);
    const all = widgetPositions(e);
    const [first, second] = all;
    e.view.dispatch(e.state.tr.setMeta(HYPHENATION_SUPPRESS, { lines: [first], page: [second] }));
    expect(widgetPositions(e)).toEqual(all.filter((p) => p !== first && p !== second));
    expect(hyphenationSuppressed(e.state)).toEqual({ lines: [first], page: [second] });
    expect(hyphenationKey.getState(e.state)!.fromLayout).toBe(true);
    e.view.dispatch(e.state.tr.setMeta(HYPHENATION_SUPPRESS, { lines: [first], page: [] }));
    expect(widgetPositions(e)).toEqual(all.filter((p) => p !== first));
    // Abschaltungen ändern nie den Text.
    expect(e.state.doc.textContent).toBe(A + B);
  });

  it("verschiebt Abschaltungen mit, wenn davor getippt wird", async () => {
    const e = await ready(A, B);
    const second = e.state.doc.child(0).nodeSize;
    const inB = widgetPositions(e).find((p) => p > second)!;
    e.view.dispatch(e.state.tr.setMeta(HYPHENATION_SUPPRESS, { lines: [inB], page: [] }));
    e.view.dispatch(e.state.tr.insertText("Neu ", 1));
    expect(hyphenationSuppressed(e.state).lines).toEqual([inB + 4]);
    expect(widgetPositions(e)).not.toContain(inB + 4);
    expect(hyphenationKey.getState(e.state)!.fromLayout).toBe(false);
  });

  it("trennt einen geänderten Absatz ohne seine alten Abschaltungen neu", async () => {
    const e = await ready(A, B);
    const [first] = widgetPositions(e);
    e.view.dispatch(e.state.tr.setMeta(HYPHENATION_SUPPRESS, { lines: [first], page: [first + 0] }));
    e.view.dispatch(e.state.tr.insertText("x", e.state.doc.child(0).nodeSize - 1));
    expect(hyphenationSuppressed(e.state)).toEqual({ lines: [], page: [] });
    expect(widgetPositions(e)).toContain(first);
  });
});
