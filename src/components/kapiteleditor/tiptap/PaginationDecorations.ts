import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { DecorationSet, type EditorView } from "@tiptap/pm/view";
import {
  createBlockPlacer,
  measurePageCount,
  resetImageRows,
  unevenPageScales,
} from "../chapterLayout";
import { isInDeadZone, placeCaretNearPoint } from "./caretPlacement";
import { computeDecorations, lineBoxHeight, readGeometry } from "./computeDecorations";

// Spec PROJ-5 — Acceptance „Zeilenweiser Soft-Break in langen Absätzen":
// wenn ein Absatz nicht vollständig auf die laufende Seite passt, fließen
// einzelne Zeilen auf die nächste Seite, ohne das ProseMirror-Dokument zu
// mutieren. Wir verwenden Widget-Decorations (block-level Inline-Spacer),
// die zwischen Zeilen platziert werden und die Folge-Zeilen optisch auf den
// Content-Top der nächsten A5-Seite drücken. Undo/Redo bleiben sauber, weil
// das Dokument unverändert bleibt.

const KEY = new PluginKey<DecorationSet>("paginationSoftBreaks");

// PROJ-25: Verbindung zum Seiten-Takt (pageLayoutClock.ts, usePagination.ts).
// Das Plugin meldet Textänderungen, gerechnet wird nur im Takt.
export type PaginationStorage = {
  requestLayout: (() => void) | null;
  runLayout: ((onPageCount: (pages: number) => void) => void) | null;
};

declare module "@tiptap/core" {
  interface Storage {
    paginationDecorations: PaginationStorage;
  }
}

/** Meldet den Seiten-Takt beim Plugin an oder mit `null` wieder ab. */
export function connectPageLayout(storage: PaginationStorage, request: (() => void) | null): void {
  storage.requestLayout = request;
}

export const PaginationDecorations = Extension.create<object, PaginationStorage>({
  name: "paginationDecorations",

  addStorage() {
    return { requestLayout: null, runLayout: null };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin<DecorationSet>({
        key: KEY,

        state: {
          init: () => DecorationSet.empty,
          apply(tr, oldSet) {
            const meta = tr.getMeta(KEY) as { decorations?: DecorationSet } | undefined;
            if (meta?.decorations !== undefined) return meta.decorations;
            return oldSet.map(tr.mapping, tr.doc);
          },
        },

        props: {
          decorations(state) {
            return KEY.getState(state) ?? null;
          },
          // Pfeil hoch/runter über einen Soft-Break hinweg. Der Spacer ist
          // ein nicht editierbarer Block mitten im Absatz; die native
          // Zeilen-Navigation des Browsers findet die Zeile dahinter nicht
          // und springt ans Absatzende (Bug 2026-11-16: „Pfeil runter" in
          // der letzten Zeile einer Seite landete am Dokumentende). Wir
          // setzen den Cursor selbst in die Nachbarzeile jenseits der
          // Seitengrenze, an dieselbe horizontale Position.
          // Klick in die tote Zone zwischen zwei Seiten (Seitenrand,
          // Zwischenraum, Seitenumbruch): Cursor in die nächstgelegene
          // Zeile der angeklickten Seite setzen — siehe caretPlacement.ts.
          handleDOMEvents: {
            mousedown(view, event) {
              if (event.button !== 0 || event.detail > 1) return false;
              if (!isInDeadZone(view, event.clientY)) return false;
              if (!placeCaretNearPoint(view, event.clientX, event.clientY, event.shiftKey)) {
                return false;
              }
              event.preventDefault();
              return true;
            },
          },
          handleKeyDown(view, event) {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return false;
            if (event.metaKey || event.ctrlKey || event.altKey) return false;
            const target = verticalMoveAcrossSoftBreak(view, event.key === "ArrowDown");
            if (target === null) return false;
            const { selection, doc } = view.state;
            const anchor = event.shiftKey ? selection.anchor : target;
            view.dispatch(
              view.state.tr
                .setSelection(TextSelection.create(doc, anchor, target))
                .scrollIntoView(),
            );
            event.preventDefault();
            return true;
          },
        },

        view(editorView) {
          storage.runLayout = (onPageCount) => layoutChapter(editorView, onPageCount);
          storage.requestLayout?.();

          return {
            update(view, prevState) {
              if (view.state.doc !== prevState.doc) storage.requestLayout?.();
            },
            destroy() {
              storage.runLayout = null;
            },
          };
        },
      }),
    ];
  },
});

// Zielposition für Pfeil hoch/runter, wenn die Nachbarzeile hinter einem
// Soft-Break-Spacer desselben Absatzes liegt; sonst null (Browser-Standard).
//
// Aufbau im DOM: … Textzeile │ Trigger-Zeile (leer, Zeilenhöhe) │ Gap-Block
// │ Textzeile …  Die Zeile VOR dem Spacer endet eine Zeilenhöhe über der
// Gap-Oberkante, die Zeile DANACH beginnt an der Gap-Unterkante.
function verticalMoveAcrossSoftBreak(view: EditorView, down: boolean): number | null {
  const { $head, head } = view.state.selection;
  if (!$head.parent.isTextblock) return null;
  const blockDom = view.nodeDOM($head.before());
  if (!(blockDom instanceof HTMLElement)) return null;
  const gaps = blockDom.querySelectorAll<HTMLElement>(".a5-soft-break-spacer__gap");
  if (gaps.length === 0) return null;

  let caret: { top: number; bottom: number; left: number };
  try {
    caret = view.coordsAtPos(head);
  } catch {
    return null;
  }
  const stack = blockDom.closest(".a5-stack") as HTMLElement | null;
  const zoom = stack
    ? parseFloat(getComputedStyle(stack).getPropertyValue("--ui-zoom") || "1") || 1
    : 1;
  // Zeilenhöhe in Bildschirm-Pixeln (Rects sind mit dem UI-Zoom skaliert).
  const lineHeight = lineBoxHeight(blockDom, caret.bottom - caret.top) * zoom;
  const caretMid = (caret.top + caret.bottom) / 2;

  for (const gap of gaps) {
    const rect = gap.getBoundingClientRect();
    let targetY: number | null = null;
    if (down) {
      // Cursor steht in der Zeile direkt über der Trigger-Zeile.
      const lineAboveMid = rect.top - 1.5 * lineHeight;
      if (Math.abs(caretMid - lineAboveMid) < lineHeight / 2) {
        targetY = rect.bottom + lineHeight / 2;
      }
    } else {
      // Cursor steht in der ersten Zeile nach dem Gap.
      const lineBelowMid = rect.bottom + lineHeight / 2;
      if (Math.abs(caretMid - lineBelowMid) < lineHeight / 2) {
        targetY = rect.top - 1.5 * lineHeight;
      }
    }
    if (targetY === null) continue;
    const found = view.posAtCoords({ left: caret.left, top: targetY });
    if (!found) return null;
    // Nur innerhalb desselben Absatzes springen.
    if (found.pos < $head.start() || found.pos > $head.end()) return null;
    return found.pos;
  }
  return null;
}

// PROJ-34: Ein Durchlauf von oben nach unten. Text, Bildreihen und Umbrüche
// werden in Lesereihenfolge gesetzt, jeder Schritt kennt die Lage darüber.
function layoutChapter(view: EditorView, onPageCount: (pages: number) => void) {
  const dom = view.dom as HTMLElement;
  const fg = dom.closest(".a5-stack__fg") as HTMLElement | null;
  const stack = dom.closest(".a5-stack") as HTMLElement | null;
  if (!fg || !stack || fg.getClientRects().length === 0) return;

  const geom = readGeometry(stack);
  if (!geom || geom.stride <= 0 || geom.contentHeight <= 0) return;
  const zoom = parseFloat(getComputedStyle(stack).getPropertyValue("--ui-zoom") || "1") || 1;
  // Alte Umbrüche entfernen, damit die Messung den natürlichen Fluss sieht.
  const previous = KEY.getState(view.state);
  if (previous && previous !== DecorationSet.empty) {
    view.dispatch(view.state.tr.setMeta(KEY, { decorations: DecorationSet.empty }));
  }
  resetImageRows(fg);

  let placer = createBlockPlacer(fg, geom, zoom, new Map());
  let { decorations } = computeDecorations(view, fg, geom, placer.place);

  // Bilder auf derselben Seite bekommen dieselbe Größe. Das verschiebt, was
  // darunter steht, deshalb genau ein zweiter Durchlauf.
  const caps = unevenPageScales(placer.rows);
  if (caps.size > 0) {
    resetImageRows(fg);
    placer = createBlockPlacer(fg, geom, zoom, caps);
    ({ decorations } = computeDecorations(view, fg, geom, placer.place));
  }

  if (decorations.length > 0) {
    const set = DecorationSet.create(view.state.doc, decorations);
    view.dispatch(view.state.tr.setMeta(KEY, { decorations: set }));
  }
  onPageCount(measurePageCount(fg, dom, geom.stride, zoom));
}
