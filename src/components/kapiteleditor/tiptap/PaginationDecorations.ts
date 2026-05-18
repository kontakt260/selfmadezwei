import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

// Spec PROJ-5 — Acceptance „Zeilenweiser Soft-Break in langen Absätzen":
// wenn ein Absatz nicht vollständig auf die laufende Seite passt, fließen
// einzelne Zeilen auf die nächste Seite, ohne das ProseMirror-Dokument zu
// mutieren. Wir verwenden Widget-Decorations (block-level Inline-Spacer),
// die zwischen Zeilen platziert werden und die Folge-Zeilen optisch auf den
// Content-Top der nächsten A5-Seite drücken. Undo/Redo bleiben sauber, weil
// das Dokument unverändert bleibt.

const KEY = new PluginKey<DecorationSet>("paginationSoftBreaks");

type Geometry = {
  pageHeight: number;
  marginTop: number;
  marginBottom: number;
  gap: number;
  stride: number;
  contentHeight: number;
};

export const PaginationDecorations = Extension.create({
  name: "paginationDecorations",

  addProseMirrorPlugins() {
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
        },

        view(editorView) {
          let raf: number | null = null;
          let muteUpdates = false;

          const schedule = () => {
            if (raf !== null) return;
            raf = requestAnimationFrame(() => {
              raf = null;
              if (muteUpdates) return;
              muteUpdates = true;
              try {
                recompute(editorView);
              } finally {
                muteUpdates = false;
              }
            });
          };

          schedule();

          const onResize = () => schedule();
          window.addEventListener("resize", onResize);

          const fg = editorView.dom.closest(".a5-stack__fg") as HTMLElement | null;
          const ro = new ResizeObserver(() => schedule());
          if (fg) ro.observe(fg);

          return {
            update(view, prevState) {
              if (muteUpdates) return;
              if (view.state.doc !== prevState.doc) schedule();
            },
            destroy() {
              if (raf !== null) cancelAnimationFrame(raf);
              window.removeEventListener("resize", onResize);
              ro.disconnect();
            },
          };
        },
      }),
    ];
  },
});

function recompute(view: EditorView) {
  const dom = view.dom as HTMLElement;
  const fg = dom.closest(".a5-stack__fg") as HTMLElement | null;
  const stack = dom.closest(".a5-stack") as HTMLElement | null;
  if (!fg || !stack) return;

  const geom = readGeometry(stack);
  if (!geom || geom.stride <= 0 || geom.contentHeight <= 0) return;

  // PASS 1: alte Decorations löschen, damit die nächste Messung den
  // natürlichen Text-Fluss sieht (sonst messen wir die Positionen
  // INKLUSIVE der schon eingefügten Spacer = Daten-Schmutz).
  const currentSet = KEY.getState(view.state);
  if (currentSet && currentSet !== DecorationSet.empty) {
    view.dispatch(view.state.tr.setMeta(KEY, { decorations: DecorationSet.empty }));
    // PM hat das DOM synchron aktualisiert; offsetHeight erzwingt Re-Layout
    void fg.offsetHeight;
  }

  // PASS 2: messen + neue Decorations berechnen
  const decorations = computeDecorations(view, fg, geom);

  if (decorations.length === 0) return;

  const set = DecorationSet.create(view.state.doc, decorations);
  view.dispatch(view.state.tr.setMeta(KEY, { decorations: set }));
}

function computeDecorations(view: EditorView, fg: HTMLElement, geom: Geometry): Decoration[] {
  const fgTop = fg.getBoundingClientRect().top;
  const decorations: Decoration[] = [];
  // Akkumuliert die Spacer-Höhen aller VORHERIGEN Absätze. Wir messen
  // die Absatz-Positionen am natürlichen Flow (alle Decorations sind in
  // PASS 1 weggeräumt), aber nach dem finalen Dispatch werden alle
  // Decorations gleichzeitig eingefügt und nachfolgende Absätze rutschen
  // entsprechend nach unten. Ohne diesen Accumulator würden die Spacer
  // späterer Absätze zu klein berechnet (s. QA-Befund 2026-05-18).
  let interParaShift = 0;

  view.state.doc.descendants((node, pos) => {
    if (!node.isTextblock || node.content.size === 0) return true;
    const nodeDom = view.nodeDOM(pos);
    if (!(nodeDom instanceof HTMLElement)) return true;

    const blockRect = nodeDom.getBoundingClientRect();
    const blockTopNatural = blockRect.top - fgTop;
    const blockBottomNatural = blockRect.bottom - fgTop;
    if (blockBottomNatural <= blockTopNatural) return false;

    const blockTop = blockTopNatural + interParaShift;
    const blockBottom = blockBottomNatural + interParaShift;

    const startFrameIdx = Math.max(0, Math.floor(blockTop / geom.stride));
    const startFrameContentBottom =
      startFrameIdx * geom.stride + geom.marginTop + geom.contentHeight;
    // Schnellcheck: passt der Block komplett in den Content-Bereich seiner
    // Start-Seite, brauchen wir gar nichts zu tun. Wir vergleichen mit der
    // CONTENT-Untergrenze (nicht mit der Frame-Grenze), damit auch Blöcke
    // erkannt werden, die zwar nicht in die nächste Frame-Tile rutschen,
    // aber in den Zwischenraum oberhalb davon (= GAP zwischen zwei A5-
    // Seiten) hineinragen — das war exakt der QA-Befund vom 2026-05-18.
    if (blockBottom <= startFrameContentBottom + 0.5) return false;

    // endFrameIdx wird hier nur als Schleifen-Sicherheitslimit verwendet,
    // nicht mehr als „Überschreitet eine Frame-Grenze?"-Filter.
    const endFrameIdx = Math.max(
      startFrameIdx,
      Math.floor((blockBottom - 1) / geom.stride),
    );

    const range = document.createRange();
    range.selectNodeContents(nodeDom);
    const lineRects = mergeLineRects(Array.from(range.getClientRects()));
    if (lineRects.length === 0) return false;

    let currentFrameIdx = startFrameIdx;
    let cumulativeShift = interParaShift;
    let thisParaSpacerHeight = 0;
    let i = 0;

    while (i < lineRects.length) {
      const lr = lineRects[i];
      const effectiveBottom = lr.bottom - fgTop + cumulativeShift;
      const currentContentBottom =
        currentFrameIdx * geom.stride + geom.marginTop + geom.contentHeight;

      if (effectiveBottom > currentContentBottom + 0.5) {
        // Witwen-/Waisen-Regel (Word-Standard, min. 2 Zeilen pro Seite):
        //  - Widow: nur die LETZTE Zeile würde alleine auf die nächste Seite —
        //    eine zusätzliche Zeile vom Ende der laufenden Seite mit nach
        //    unten ziehen (pushIdx -= 1).
        //  - Orphan: nur 1 Zeile würde auf der laufenden Seite zurückbleiben —
        //    den ganzen Absatz auf die nächste Seite schieben (pushIdx = 0).
        let pushIdx = i;
        if (pushIdx === lineRects.length - 1 && pushIdx > 0) pushIdx -= 1;
        if (pushIdx === 1) pushIdx = 0;

        const pushedLine = lineRects[pushIdx];
        const pushedEffectiveTop = pushedLine.top - fgTop + cumulativeShift;
        const nextContentTop = (currentFrameIdx + 1) * geom.stride + geom.marginTop;
        const delta = nextContentTop - pushedEffectiveTop;

        if (delta > 0.5) {
          const coord = view.posAtCoords({
            left: pushedLine.left + 1,
            top: pushedLine.top + pushedLine.height / 2,
          });
          if (coord) {
            decorations.push(buildSpacerDecoration(coord.pos, delta));
            cumulativeShift += delta;
            thisParaSpacerHeight += delta;
            currentFrameIdx++;
            // Zeilen [pushIdx .. i] sind jetzt auf der Folgeseite,
            // weiter mit der Zeile direkt danach.
            i = pushIdx + 1;
            if (currentFrameIdx > endFrameIdx + 1) break;
            continue;
          }
        }
      }

      i += 1;
      if (currentFrameIdx > endFrameIdx + 1) break;
    }

    interParaShift += thisParaSpacerHeight;
    return false;
  });

  return decorations;
}

function buildSpacerDecoration(pos: number, height: number): Decoration {
  return Decoration.widget(
    pos,
    () => {
      const span = document.createElement("span");
      span.className = "a5-soft-break-spacer";
      span.setAttribute("data-soft-break", "1");
      span.setAttribute("aria-hidden", "true");
      span.style.cssText = `display:block;height:${height}px;line-height:0;user-select:none;pointer-events:none;`;
      return span;
    },
    {
      side: -1,
      ignoreSelection: true,
      key: `soft-break@${pos}@${Math.round(height)}`,
    },
  );
}

type Line = { top: number; bottom: number; left: number; right: number; height: number };

function mergeLineRects(rects: DOMRect[]): Line[] {
  if (rects.length === 0) return [];
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: Line[] = [];
  for (const r of sorted) {
    if (r.width <= 0 || r.height <= 0) continue;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.top - r.top) < 2) {
      last.bottom = Math.max(last.bottom, r.bottom);
      last.left = Math.min(last.left, r.left);
      last.right = Math.max(last.right, r.right);
      last.height = last.bottom - last.top;
    } else {
      lines.push({
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        height: r.height,
      });
    }
  }
  return lines;
}

function readGeometry(stack: HTMLElement): Geometry | null {
  const cs = getComputedStyle(stack);
  const rootFontPx =
    parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

  const pageHeight = parseLen(cs.getPropertyValue("--a5-page-height"), rootFontPx, 793.7);
  const marginTop = parseLen(cs.getPropertyValue("--a5-margin-top"), rootFontPx, 75.59);
  const marginBottom = parseLen(cs.getPropertyValue("--a5-margin-bottom"), rootFontPx, 75.59);
  const gap = parseLen(cs.getPropertyValue("--a5-page-gap"), rootFontPx, 40);

  const stride = pageHeight + gap;
  const contentHeight = pageHeight - marginTop - marginBottom;
  return { pageHeight, marginTop, marginBottom, gap, stride, contentHeight };
}

function parseLen(raw: string, rootFontPx: number, fallback: number): number {
  const v = (raw ?? "").trim();
  if (!v) return fallback;
  const num = parseFloat(v);
  if (Number.isNaN(num)) return fallback;
  if (v.endsWith("mm")) return (num / 25.4) * 96;
  if (v.endsWith("cm")) return (num / 2.54) * 96;
  if (v.endsWith("in")) return num * 96;
  if (v.endsWith("rem")) return num * rootFontPx;
  if (v.endsWith("em")) return num * rootFontPx;
  if (v.endsWith("px")) return num;
  return num;
}
