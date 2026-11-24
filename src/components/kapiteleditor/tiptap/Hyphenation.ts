import { Extension } from "@tiptap/core";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import {
  hyphenationPoints,
  isHyphenationReady,
  loadHyphenation,
  SOFT_HYPHEN,
  stripSoftHyphens,
} from "@/lib/hyphenation";

// PROJ-35: Silbentrennung als Anzeige. Die erlaubten Trennstellen (Trenn-Baustein
// in `@/lib/hyphenation`) stehen als unsichtbare Markierung NEBEN dem Text, nie
// im Text. Gespeicherter und kopierter Text, Rückgängig und Wortzahl bleiben
// dadurch sauber, und Pfeiltasten oder Rücktaste haben keine unsichtbaren
// Stopps. Die Browser-Trennung ist im Buchtext aus (globals.css,
// `hyphens: manual`), damit jedes Gerät dieselben Stellen nutzt.
//
// Beim Tippen wird nur der geänderte Absatz neu getrennt. Während einer
// Wort-Eingabe mit Autokorrektur (Tablet, Composition) bleibt der Absatz unter
// dem Cursor, wie er ist, und wird danach getrennt.

/**
 * Trennstellen, die der Seiten-Takt abgeschaltet hat (Schritt 3):
 * `lines` damit höchstens 3 Zeilen in Folge getrennt enden (AC-8), hängt nur am
 * Absatztext; `page` damit keine Seite mit einem Trennstrich endet (AC-9), wird
 * bei jedem Seiten-Takt neu bestimmt.
 */
export type SuppressedHyphens = { lines: number[]; page: number[] };

type HyphenationState = {
  set: DecorationSet;
  /** Absatz, der wegen einer laufenden Wort-Eingabe noch neu getrennt werden muss. */
  deferred: number | null;
  suppressed: SuppressedHyphens;
  /** Die letzte Änderung kam vom Seiten-Takt selbst und braucht keinen neuen. */
  fromLayout: boolean;
};

export const hyphenationKey = new PluginKey<HyphenationState>("hyphenation");

/** Meta: `"all"` trennt alles neu, eine Zahl den Absatz an dieser Position. */
export const HYPHENATION_REFRESH = "hyphenationRefresh";
/** Meta des Seiten-Takts: neue `SuppressedHyphens`. */
export const HYPHENATION_SUPPRESS = "hyphenationSuppress";

const NONE: SuppressedHyphens = { lines: [], page: [] };

// Zentrierter und rechtsbündiger Text wird nie getrennt (Spec AC-15).
const NO_HYPHENATION = new Set(["center", "right"]);

/** Klasse der Markierung, damit der Seiten-Takt sichtbare Trennstriche findet. */
export const HYPHEN_CLASS = "a5-shy";

// side -2: Die Markierung steht vor einem Seiten-Spacer an derselben Stelle
// (side -1, computeDecorations.ts), damit der Trennstrich am Zeilenende erscheint.
const WIDGET_SPEC = { side: -2, key: "soft-hyphen" } as const;
const softHyphen = () => {
  const span = document.createElement("span");
  span.className = HYPHEN_CLASS;
  span.textContent = SOFT_HYPHEN;
  return span;
};

export function hyphenationSuppressed(state: EditorState): SuppressedHyphens {
  return hyphenationKey.getState(state)?.suppressed ?? NONE;
}

function suppressedSet(suppressed: SuppressedHyphens): Set<number> {
  return new Set([...suppressed.lines, ...suppressed.page]);
}

function mapPositions(positions: number[], tr: Transaction): number[] {
  const out: number[] = [];
  for (const pos of positions) {
    const result = tr.mapping.mapResult(pos);
    if (!result.deleted) out.push(result.pos);
  }
  return out;
}

/** Steht an dieser Position eine erlaubte Trennstelle? Für den Seiten-Takt. */
export function isHyphenationPoint(state: EditorState, pos: number): boolean {
  const set = hyphenationKey.getState(state)?.set;
  if (!set) return false;
  return set.find(pos, pos).some((decoration) => decoration.from === pos && decoration.to === pos);
}

// Chrome setzt ein getipptes Leerzeichen direkt vor einem Element (hier: der
// Trennmarkierung) als geschütztes Leerzeichen. An ihm kann die Zeile nicht
// umbrechen, und es landete im gespeicherten Text. Steht ein getipptes
// geschütztes Leerzeichen zwischen zwei Zeichen, wird es deshalb sofort zu einem
// normalen. Am Absatzanfang, am Absatzende und neben einem weiteren Leerzeichen
// braucht der Browser es, damit es sichtbar bleibt (`white-space: normal`); dort
// bleibt es, bis weitergeschrieben wird.
const NBSP = " ";
const SPACE_LIKE = /\s/u;

function normalizeTypedSpaces(
  transactions: readonly Transaction[],
  state: EditorState,
): Transaction | null {
  let ranges: Array<[number, number]> = [];
  for (const tr of transactions) {
    ranges = ranges.map(([from, to]) => [tr.mapping.map(from, -1), tr.mapping.map(to, 1)]);
    // Während einer Wort-Eingabe nichts ändern, danach den Absatz nachholen.
    if (tr.getMeta("composition")) return null;
    // Eingefügter Text behält seine geschützten Leerzeichen.
    if (tr.getMeta("uiEvent") === "paste" || tr.getMeta("uiEvent") === "drop") continue;
    if (tr.docChanged) ranges.push(...changedRanges(tr));
    const refresh = tr.getMeta(HYPHENATION_REFRESH);
    if (typeof refresh === "number") {
      ranges.push([refresh, refresh + (tr.doc.nodeAt(refresh)?.nodeSize ?? 1)]);
    }
  }
  if (ranges.length === 0) return null;

  const { doc } = state;
  const fixes = new Set<number>();
  for (const [from, to] of ranges) {
    const start = Math.max(0, Math.min(from, to) - 1);
    const end = Math.min(doc.content.size, Math.max(from, to) + 1);
    if (start >= end) continue;
    doc.nodesBetween(start, end, (node, pos) => {
      if (!node.isText || !node.text?.includes(NBSP)) return true;
      const text = node.text;
      for (let i = Math.max(0, start - pos); i < Math.min(text.length, end - pos); i += 1) {
        if (text[i] !== NBSP) continue;
        const at = pos + i;
        const $at = doc.resolve(at);
        const before = doc.textBetween(Math.max($at.start(), at - 1), at, "\n", "\n");
        const after = doc.textBetween(at + 1, Math.min($at.end(), at + 2), "\n", "\n");
        if (before && after && !SPACE_LIKE.test(before) && !SPACE_LIKE.test(after)) fixes.add(at);
      }
      return false;
    });
  }
  if (fixes.size === 0) return null;
  const tr = state.tr;
  for (const at of fixes) tr.insertText(" ", at, at + 1);
  return tr;
}

function blockDecorations(node: PMNode, pos: number, suppressed: Set<number>): Decoration[] {
  if (!node.isTextblock || node.content.size === 0) return [];
  if (NO_HYPHENATION.has(node.attrs.textAlign as string)) return [];
  // Ein Zeichen je Inline-Knoten ("\n" für Zeilenumbrüche), damit Abstände im
  // Text genau den Positionen im Dokument entsprechen.
  const text = node.textBetween(0, node.content.size, undefined, "\n");
  return hyphenationPoints(text)
    .map((offset) => pos + 1 + offset)
    .filter((at) => !suppressed.has(at))
    .map((at) => Decoration.widget(at, softHyphen, WIDGET_SPEC));
}

function buildAll(doc: PMNode): DecorationSet {
  if (!isHyphenationReady()) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    decorations.push(...blockDecorations(node, pos, new Set()));
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/** Bereiche im neuen Dokument, die die Transaktion verändert hat. */
function changedRanges(tr: Transaction): Array<[number, number]> {
  let ranges: Array<[number, number]> = [];
  tr.mapping.maps.forEach((map, index) => {
    ranges = ranges.map(([from, to]) => [map.map(from, -1), map.map(to, 1)]);
    map.forEach((_oldFrom, _oldTo, from, to) => ranges.push([from, to]));
    // Attribut-Schritte (etwa die Ausrichtung) verschieben nichts und fehlen
    // deshalb in der Abbildung.
    const step = tr.steps[index] as { pos?: unknown };
    if (typeof step.pos === "number") ranges.push([step.pos, step.pos + 1]);
  });
  return ranges;
}

/** Trennt die betroffenen Absätze neu und meldet deren Bereiche. */
function refreshBlocks(
  set: DecorationSet,
  doc: PMNode,
  ranges: Array<[number, number]>,
  suppressed: Set<number>,
  skip: (pos: number, node: PMNode) => boolean,
): { set: DecorationSet; blocks: Array<[number, number]> } {
  const seen = new Set<number>();
  const blocks: Array<[number, number]> = [];
  const size = doc.content.size;
  for (const [from, to] of ranges) {
    const start = Math.max(0, Math.min(from, to) - 1);
    const end = Math.min(size, Math.max(from, to) + 1);
    if (start >= end) continue;
    doc.nodesBetween(start, end, (node, pos) => {
      if (!node.isTextblock) return true;
      if (seen.has(pos)) return false;
      seen.add(pos);
      if (skip(pos, node)) return false;
      blocks.push([pos, pos + node.nodeSize]);
      set = set.remove(set.find(pos, pos + node.nodeSize));
      set = set.add(doc, blockDecorations(node, pos, suppressed));
      return false;
    });
  }
  return { set, blocks };
}

function outside(positions: number[], blocks: Array<[number, number]>): number[] {
  return positions.filter((pos) => !blocks.some(([from, to]) => pos > from && pos < to));
}

function applyTransaction(tr: Transaction, value: HyphenationState, state: EditorState): HyphenationState {
  const refresh = tr.getMeta(HYPHENATION_REFRESH) as "all" | number | undefined;
  if (refresh === "all") {
    return { set: buildAll(tr.doc), deferred: null, suppressed: NONE, fromLayout: false };
  }

  const set = value.set.map(tr.mapping, tr.doc);
  let deferred = value.deferred === null ? null : tr.mapping.map(value.deferred);
  let suppressed: SuppressedHyphens = tr.docChanged
    ? { lines: mapPositions(value.suppressed.lines, tr), page: mapPositions(value.suppressed.page, tr) }
    : value.suppressed;
  if (!isHyphenationReady()) return { set, deferred, suppressed, fromLayout: false };

  // Der Seiten-Takt schaltet Trennstellen ab oder wieder ein.
  const fromLayout = tr.getMeta(HYPHENATION_SUPPRESS) as SuppressedHyphens | undefined;
  if (fromLayout) {
    const before = suppressedSet(suppressed);
    const after = suppressedSet(fromLayout);
    const changed = [...before, ...after].filter((pos) => before.has(pos) !== after.has(pos));
    const result = refreshBlocks(
      set,
      tr.doc,
      changed.map((pos) => [pos, pos] as [number, number]),
      after,
      (pos) => pos === deferred,
    );
    return { set: result.set, deferred, suppressed: fromLayout, fromLayout: true };
  }

  const ranges = tr.docChanged ? changedRanges(tr) : [];
  if (typeof refresh === "number") {
    ranges.push([refresh, refresh + 1]);
    if (deferred === refresh) deferred = null;
  }
  if (ranges.length === 0) return { set, deferred, suppressed, fromLayout: false };

  const composing = Boolean(tr.getMeta("composition"));
  const head = state.selection.head;
  // Ein geänderter Absatz wird ohne Abschaltungen neu getrennt, der Seiten-Takt
  // entscheidet danach neu.
  const result = refreshBlocks(set, tr.doc, ranges, new Set(), (pos, node) => {
    if (!composing || head <= pos || head >= pos + node.nodeSize) return false;
    deferred = pos;
    return true;
  });
  suppressed = {
    lines: outside(suppressed.lines, result.blocks),
    page: outside(suppressed.page, result.blocks),
  };
  return { set: result.set, deferred, suppressed, fromLayout: false };
}

function stripFragment(fragment: Fragment): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach((child) => {
    if (child.isText) {
      const text = stripSoftHyphens(child.text ?? "");
      if (text) nodes.push(child.type.schema.text(text, child.marks));
    } else {
      nodes.push(child.copy(stripFragment(child.content)));
    }
  });
  return Fragment.fromArray(nodes);
}

function syncSelectionFromDOM(view: EditorView): boolean {
  if (!view.state.selection.empty) return false;
  const dom = view.dom.ownerDocument.getSelection();
  if (!dom || dom.isCollapsed || !dom.anchorNode || !dom.focusNode) return false;
  if (!view.dom.contains(dom.anchorNode) || !view.dom.contains(dom.focusNode)) return false;
  try {
    const anchor = view.posAtDOM(dom.anchorNode, dom.anchorOffset);
    const head = view.posAtDOM(dom.focusNode, dom.focusOffset);
    if (anchor === head) return false;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, head)));
  } catch {
    // Unklare Stelle: ProseMirror entscheidet wie bisher.
  }
  return false;
}

export const HyphenationDisplay = Extension.create({
  name: "hyphenationDisplay",

  addProseMirrorPlugins() {
    const editor = this.editor;
    const requestLayout = () => editor.storage.paginationDecorations?.requestLayout?.();

    return [
      new Plugin<HyphenationState>({
        key: hyphenationKey,

        state: {
          init: (_config, state) => ({
            set: buildAll(state.doc),
            deferred: null,
            suppressed: NONE,
            fromLayout: false,
          }),
          apply: (tr, value, _oldState, newState) => applyTransaction(tr, value, newState),
        },

        appendTransaction: (transactions, _oldState, newState) =>
          normalizeTypedSpaces(transactions, newState),

        props: {
          decorations(state) {
            return hyphenationKey.getState(state)?.set ?? null;
          },
          // Eingefügter Text aus Word oder einer Mail bringt manchmal eigene
          // Trennzeichen mit. Sie kommen nicht in den Text.
          transformPastedText(text) {
            return stripSoftHyphens(text);
          },
          transformPasted(slice) {
            if (!slice.content.textBetween(0, slice.content.size, "", "").includes(SOFT_HYPHEN)) {
              return slice;
            }
            return new Slice(stripFragment(slice.content), slice.openStart, slice.openEnd);
          },
          handleDOMEvents: {
            // Kommt Kopieren unmittelbar nach dem Markieren mit der Tastatur, kennt
            // ProseMirror die neue Markierung manchmal noch nicht und überlässt das
            // Kopieren dem Browser. Der nähme die Trennmarkierungen mit. Deshalb
            // wird die Markierung vorher übernommen, dann kopiert ProseMirror
            // selbst den reinen Text.
            copy: (view) => syncSelectionFromDOM(view),
            cut: (view) => syncSelectionFromDOM(view),
            compositionend(view) {
              // ProseMirror schließt die Eingabe erst kurz danach ab.
              setTimeout(() => {
                const deferred = hyphenationKey.getState(view.state)?.deferred;
                if (deferred === null || deferred === undefined || view.isDestroyed) return;
                view.dispatch(
                  view.state.tr.setMeta(HYPHENATION_REFRESH, deferred).setMeta("addToHistory", false),
                );
              }, 0);
              return false;
            },
          },
        },

        view(editorView) {
          let destroyed = false;
          if (!isHyphenationReady()) {
            void loadHyphenation().then(() => {
              if (destroyed || !isHyphenationReady()) return;
              editorView.dispatch(
                editorView.state.tr.setMeta(HYPHENATION_REFRESH, "all").setMeta("addToHistory", false),
              );
            });
          }
          return {
            update(view, prevState) {
              // Neue Trennstellen ohne Textänderung (Wörterbuch geladen, Wort-Eingabe
              // beendet) brauchen einen neuen Seiten-Takt. Bei Textänderungen
              // meldet sich der Seiten-Takt selbst.
              if (view.state.doc !== prevState.doc) return;
              const now = hyphenationKey.getState(view.state);
              if (!now || now.fromLayout) return;
              if (now.set !== hyphenationKey.getState(prevState)?.set) requestLayout();
            },
            destroy() {
              destroyed = true;
            },
          };
        },
      }),
    ];
  },
});
