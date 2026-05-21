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
          let followUpRaf: number | null = null;

          const schedule = () => {
            // Cancel-and-requeue rAF: verhindert stuck-state (Bug 2026-05-20).
            // Throttle auf 10 Hz war zu langsam für die Konvergenz zwischen
            // PD und usePagination — bei rAF (60 Hz) konvergiert das System
            // in ~50 ms statt 10+ s.
            if (raf !== null) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
              raf = null;
              if (muteUpdates) return;
              muteUpdates = true;
              try {
                recompute(editorView);
              } finally {
                muteUpdates = false;
              }
              // Settling-Pass: ein zweiter Lauf nach drei rAFs, falls die
              // parallele Block-Push-Engine (EditorClient.usePagination)
              // erst nach unserem ersten Pass marginTop/break-Höhe gesetzt
              // hat → Doc-Positionen verschieben sich nachträglich, ohne
              // Doc-Transaktion. Der zweite Pass misst den endgültig
              // gerenderten Stand und korrigiert Spacer-Längen/-Positionen.
              if (followUpRaf !== null) cancelAnimationFrame(followUpRaf);
              followUpRaf = requestAnimationFrame(() => {
                followUpRaf = requestAnimationFrame(() => {
                  followUpRaf = requestAnimationFrame(() => {
                    followUpRaf = null;
                    if (muteUpdates) return;
                    muteUpdates = true;
                    try {
                      recompute(editorView);
                    } finally {
                      muteUpdates = false;
                    }
                  });
                });
              });
            });
          };

          schedule();

          const onResize = () => schedule();
          window.addEventListener("resize", onResize);

          const fg = editorView.dom.closest(".a5-stack__fg") as HTMLElement | null;
          // RO triggert PD-Recompute nur, wenn fg's HÖHE sich um >5 px ändert
          // UND die Änderung mind. 250 ms stabil bleibt (Debounce). Verhindert
          // dass jede Mikro-Schwankung durch Image-Row-Mutation einen PD-
          // Recompute auslöst, der wiederum usePagination's PASS 1 Push-
          // Entscheidung verschiebt (Bug 2026-05-20: Layout-Switch Oszillation).
          let lastFgH = fg ? fg.getBoundingClientRect().height : 0;
          let roTimer: ReturnType<typeof setTimeout> | null = null;
          const ro = new ResizeObserver(() => {
            if (!fg) return;
            const h = fg.getBoundingClientRect().height;
            if (Math.abs(h - lastFgH) < 5) return;
            if (roTimer) clearTimeout(roTimer);
            roTimer = setTimeout(() => {
              roTimer = null;
              lastFgH = fg.getBoundingClientRect().height;
              schedule();
            }, 250);
          });
          if (fg) ro.observe(fg);

          // IMG-Lade-Listener: nach Image-Upload kann das ResizeObserver-Event
          // feuern, BEVOR das Bild seine endgültige Pixel-Größe hat (Browser
          // rendert ein noch nicht geladenes <img> mit 0×0). Wir hängen an
          // jedes IMG einen `load`-Handler, der nach erfolgtem Laden noch
          // einmal pagniert. Neue IMGs werden via MutationObserver erkannt.
          const attached = new WeakSet<HTMLImageElement>();
          const attachImageListener = (img: HTMLImageElement) => {
            if (attached.has(img)) return;
            attached.add(img);
            if (!img.complete) {
              img.addEventListener("load", schedule, { once: true });
            }
          };
          if (fg) {
            fg.querySelectorAll("img").forEach(attachImageListener);
          }
          const mo = new MutationObserver((records) => {
            for (const rec of records) {
              rec.addedNodes.forEach((n) => {
                if (n instanceof HTMLImageElement) attachImageListener(n);
                else if (n instanceof Element) {
                  n.querySelectorAll("img").forEach(attachImageListener);
                }
              });
            }
          });
          if (fg) mo.observe(fg, { childList: true, subtree: true });

          // Externer Trigger für React-State-Änderungen (z. B. setImageSections,
          // setTitle), die nicht über ProseMirror laufen. EditorClient feuert
          // dieses Event in einem useEffect, das auf imageSections/title hört.
          const onExternalTrigger = () => schedule();
          document.addEventListener("narravit:pagination-recompute", onExternalTrigger);

          return {
            update(view, prevState) {
              if (muteUpdates) return;
              if (view.state.doc !== prevState.doc) schedule();
            },
            destroy() {
              if (raf !== null) cancelAnimationFrame(raf);
              if (followUpRaf !== null) cancelAnimationFrame(followUpRaf);
              window.removeEventListener("resize", onResize);
              document.removeEventListener("narravit:pagination-recompute", onExternalTrigger);
              ro.disconnect();
              mo.disconnect();
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

  // Vorherigen Decoration-Stand FESTHALTEN, bevor wir ihn (für die
  // nächste natürliche Messung) clearen. Wir vergleichen am Ende den
  // neuen mit dem alten Set — gleich = Spacer-Konfiguration unverändert
  // = kein Trigger für usePagination nötig (verhindert Endlos-Schleife).
  const prevSetCaptured = KEY.getState(view.state);
  const prevSpec = decorationSignature(prevSetCaptured);

  // PASS 1: alte Decorations löschen, damit die nächste Messung den
  // natürlichen Text-Fluss sieht (sonst messen wir die Positionen
  // INKLUSIVE der schon eingefügten Spacer = Daten-Schmutz).
  if (prevSetCaptured && prevSetCaptured !== DecorationSet.empty) {
    view.dispatch(view.state.tr.setMeta(KEY, { decorations: DecorationSet.empty }));
    // PM hat das DOM synchron aktualisiert; offsetHeight erzwingt Re-Layout
    void fg.offsetHeight;
  }

  // PASS 2: messen + neue Decorations berechnen
  const { decorations } = computeDecorations(view, fg, geom);

  if (decorations.length === 0) return;

  const set = DecorationSet.create(view.state.doc, decorations);
  view.dispatch(view.state.tr.setMeta(KEY, { decorations: set }));
  const newSpec = decorationSignature(set);

  // usePagination informieren wenn sich die Spacer-Konfiguration geändert
  // hat: Spacer-Tausch (einer schrumpft, anderer wächst) kann die fg-Höhe
  // unverändert lassen → ResizeObserver feuert nicht → PASS 1a misst HRs
  // gegen veralteten observedTop. Folge: HR-Höhen zeigen nicht mehr auf
  // den Frame-Top der Folgeseite (Bug 2026-05-20: Seite 5 beginnt 88 px
  // tief). Vergleich gegen das ALTE Set (prevSetCaptured) bricht die
  // Endlos-Schleife — nach Stabilisierung gibt es keinen weiteren Dispatch.
  if (newSpec !== prevSpec && typeof document !== "undefined") {
    document.dispatchEvent(new Event("narravit:pagination-recompute"));
  }
}

function decorationSignature(set: DecorationSet | null | undefined): string {
  if (!set || set === DecorationSet.empty) return "";
  const decos = set.find();
  return decos
    .map((d) => {
      // Spacer-Decorations kodieren die Höhe in ihrem unique `key`
      // (siehe buildSpacerDecoration: `soft-break@pos@height@…`).
      const spec = d.spec as { key?: string };
      return `${d.from}:${d.to}:${spec?.key ?? ""}`;
    })
    .join(",");
}

function computeDecorations(
  view: EditorView,
  fg: HTMLElement,
  geom: Geometry,
): { decorations: Decoration[]; paragraphsWithSoftBreak: Set<HTMLElement> } {
  const fgTop = fg.getBoundingClientRect().top;
  // UI-Zoom: wenn `.a5-stack` per transform: scale skaliert ist, sind
  // alle getBoundingClientRect-Werte mit dem Zoom-Faktor multipliziert.
  // Wir teilen Positionen und Höhen durch zoom, damit die Engine wieder
  // im LOGISCHEN A5-Koordinatensystem rechnet.
  const stackEl = fg.closest(".a5-stack") as HTMLElement | null;
  const zoom = stackEl
    ? parseFloat(getComputedStyle(stackEl).getPropertyValue("--ui-zoom") || "1") || 1
    : 1;
  const decorations: Decoration[] = [];
  const paragraphsWithSoftBreak = new Set<HTMLElement>();
  // Akkumuliert die Spacer-Höhen aller VORHERIGEN Absätze. Wir messen
  // die Absatz-Positionen am natürlichen Flow (alle Decorations sind in
  // PASS 1 weggeräumt), aber nach dem finalen Dispatch werden alle
  // Decorations gleichzeitig eingefügt und nachfolgende Absätze rutschen
  // entsprechend nach unten. Ohne diesen Accumulator würden die Spacer
  // späterer Absätze zu klein berechnet (s. QA-Befund 2026-05-18).
  let interParaShift = 0;
  // Pro Blockquote: gesammelte Spacer-Y-Bereiche in Blockquote-lokalen,
  // POST-Render-Koordinaten. Nach der Traversierung wird daraus eine
  // `mask-image`-Decoration auf der Blockquote gebaut, die die Border
  // genau in diesen Y-Bereichen ausblendet — ohne visuelles Overlay
  // (siehe CLAUDE.md „Keine visuellen Overlay-Hacks").
  type BqInfo = {
    bqStart: number;
    bqEnd: number;
    // Top der Blockquote im fg-Koord-System nach Außen-Shifts (= naturalTop
    // + interParaShift beim BQ-Eintritt). Spacer-Y in fg minus diesem Wert
    // ergibt die Blockquote-lokale Y-Koordinate für die Mask.
    renderedTop: number;
    gaps: Array<{ start: number; end: number }>;
  };
  const bqInfo = new Map<number, BqInfo>();

  view.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const nodeDom = view.nodeDOM(pos);
    if (!(nodeDom instanceof HTMLElement)) return true;

    // Prüfen ob dieser Textblock in einer Blockquote sitzt — wenn ja,
    // sammeln wir die Y-Bereiche aller Spacer pro Blockquote, um nach der
    // Traversierung eine `mask-image`-Decoration auf der Blockquote zu
    // setzen (Border wird in diesen Bereichen sauber ausgeblendet).
    const $pos = view.state.doc.resolve(pos);
    const parentIsBlockquote =
      $pos.depth > 0 && $pos.parent.type.name === "blockquote";
    let currentBqStart = -1;
    if (parentIsBlockquote) {
      currentBqStart = $pos.before($pos.depth);
      if (!bqInfo.has(currentBqStart)) {
        const bqDom = view.nodeDOM(currentBqStart);
        if (bqDom instanceof HTMLElement) {
          const naturalTop = (bqDom.getBoundingClientRect().top - fgTop) / zoom;
          bqInfo.set(currentBqStart, {
            bqStart: currentBqStart,
            bqEnd: $pos.after($pos.depth),
            // Außen-Shifts (= Spacer in Absätzen VOR der BQ) sind in
            // interParaShift schon akkumuliert. Wir fixieren sie hier
            // bei BQ-Eintritt, sodass spätere Spacer INNERHALB der BQ
            // den Außen-Shift nicht doppelt einrechnen.
            renderedTop: naturalTop + interParaShift,
            gaps: [],
          });
        }
      }
    }

    const blockRect = nodeDom.getBoundingClientRect();
    const blockTopNatural = (blockRect.top - fgTop) / zoom;
    const blockBottomNatural = (blockRect.bottom - fgTop) / zoom;
    if (blockBottomNatural <= blockTopNatural && node.content.size > 0) return false;

    const blockTop = blockTopNatural + interParaShift;
    const blockBottom = blockBottomNatural + interParaShift;

    const startFrameIdx = Math.max(0, Math.floor(blockTop / geom.stride));
    const startFrameContentBottom =
      startFrameIdx * geom.stride + geom.marginTop + geom.contentHeight;

    // BLOCK-LEVEL PUSH NUR für „atomare" Blöcke (Fix 2026-05-20):
    //   - leere Absätze (Placeholder, einzelne Enter-Zeilen)
    //   - 1-Zeilen-Absätze die nicht soft-breakable sind
    // Für MULTI-LINE-Absätze wäre Block-Push falsch — der Soft-Break-Code
    // unten splittet sie zeilenweise, sodass die ersten Zeilen auf der
    // aktuellen Seite bleiben und nur die überlaufenden Zeilen auf die
    // nächste Seite wandern (Word-Standard).
    if (node.content.size === 0) {
      // Empty paragraphs: block-push if they overflow.
      if (
        blockBottom > startFrameContentBottom + 0.5 &&
        blockRect.height / zoom <= geom.contentHeight + 0.5
      ) {
        const nextContentTop = (startFrameIdx + 1) * geom.stride + geom.marginTop;
        const delta = nextContentTop - blockTop;
        if (delta > 0.5) {
          decorations.push(buildBlockPushDecoration(pos, delta));
          // Bei Blockquote: Block-Push-Spacer (für leere Absätze) auch
          // in die Mask-Gaps aufnehmen, sonst zeigt die Border weiter
          // im Page-Gap (Bug 2026-05-20: Enter-Drücken in Blockquote
          // schmuggelt die Border zurück in den Seitenzwischenraum).
          if (parentIsBlockquote && currentBqStart >= 0) {
            const info = bqInfo.get(currentBqStart);
            if (info) {
              let localStart = blockTop - info.renderedTop;
              if (localStart < 6) localStart = 0;
              info.gaps.push({ start: localStart, end: localStart + delta });
            }
          }
          interParaShift += delta;
        }
      }
      return true;
    }

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
      const effectiveBottom = (lr.bottom - fgTop) / zoom + cumulativeShift;
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
        const pushedEffectiveTop = (pushedLine.top - fgTop) / zoom + cumulativeShift;
        const nextContentTop = (currentFrameIdx + 1) * geom.stride + geom.marginTop;
        const delta = nextContentTop - pushedEffectiveTop;

        if (delta > 0.5) {
          const coord = view.posAtCoords({
            left: pushedLine.left + 1,
            top: pushedLine.top + pushedLine.height / 2,
          });
          if (coord) {
            // Trailing-Whitespace-Hide (2026-05-19): die zusammenhängende
            // Whitespace-Sequenz unmittelbar VOR coord.pos wird per Inline-
            // Decoration mit `display:none` ausgeblendet. Resultat: das
            // letzte sichtbare Wort der Vor-Zeile klebt bündig am rechten
            // Rand (kein Justify-Stretching des Trailing-Spaces), und die
            // Folgezeile startet ohne Leading-Space-Indent.
            // Wort-genaue Bruchstelle (Audit Bug 2, 2026-05-21): wenn
            // posAtCoords mitten in einem Wort liegt (Blocksatz zieht
            // Wörter rechts auseinander), würde der Spacer das Wort über
            // zwei Seiten zerreißen. Wir snappen den Cursor erst nach links
            // bis vor das aktuelle Wort, dann läuft die Whitespace-Sucht
            // ihre normale Schleife.
            const $pos = view.state.doc.resolve(coord.pos);
            const blockStart = $pos.start();
            const WS_RE = /[\s ­]/;
            let insertPos = coord.pos;
            while (insertPos > blockStart) {
              const ch = view.state.doc.textBetween(insertPos - 1, insertPos);
              if (ch === "" || WS_RE.test(ch)) break;
              insertPos--;
            }
            let wsStart = insertPos;
            while (wsStart > blockStart) {
              const ch = view.state.doc.textBetween(wsStart - 1, wsStart);
              if (ch === " " || ch === " " || ch === "\t") {
                wsStart--;
              } else {
                break;
              }
            }
            if (wsStart < insertPos) {
              decorations.push(
                Decoration.inline(
                  wsStart,
                  insertPos,
                  { style: "display:none" },
                  { key: `soft-break-ws@${wsStart}@${insertPos}` },
                ),
              );
            }
            decorations.push(
              buildSpacerDecoration(insertPos, delta, {
                inBlockquote: parentIsBlockquote,
              }),
            );
            // Per-Blockquote Gap-Range tracking für die Mask-Decoration.
            // Der Spacer nimmt im POST-Render-DOM den Y-Bereich
            //   [pushedEffectiveTop, pushedEffectiveTop + delta]
            // im fg-Koord-System ein. Übersetzt in Blockquote-lokale
            // POST-Render-Y-Koords: subtrahieren wir den Top der BQ.
            // Da die BQ-Spacer-Shifts die BQ-Höhe nach UNTEN erweitern,
            // verschiebt sich der BQ-Top NICHT (er bleibt bei naturalTop +
            // shifts AUSSERHALB der BQ). Den Außen-Shift bekommen wir
            // automatisch, weil pushedEffectiveTop ihn schon enthält und
            // naturalTop ihn nicht — Differenz = Inner-Local-Y.
            if (parentIsBlockquote && currentBqStart >= 0) {
              const info = bqInfo.get(currentBqStart);
              if (info) {
                let localStart = pushedEffectiveTop - info.renderedTop;
                // Wenn der Spacer praktisch am BQ-Top sitzt (kleiner
                // Baseline-Offset zur ersten Zeile, < 6 px), Range bis
                // Y=0 ziehen — sonst bleibt ein winziger Border-Stub auf
                // der Vorseite über der BQ-Top sichtbar (Bug 2026-05-20:
                // „mini blockquote auf seite 1 obwohl kein text dort ist").
                if (localStart < 6) localStart = 0;
                info.gaps.push({ start: localStart, end: localStart + delta });
              }
            }
            paragraphsWithSoftBreak.add(nodeDom);
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

  // Nach der Traversierung: Pro Blockquote mit Spacer-Bereichen eine
  // Node-Decoration mit `mask-image` emittieren, die die Border in
  // diesen Y-Bereichen sauber ausblendet — KEIN visueller Overlay
  // (CLAUDE.md „Keine visuellen Overlay-Hacks"). Die Mask reicht von
  // schwarz (sichtbar) → transparent (ausgeblendet) → schwarz, mit
  // hartem Übergang an den Spacer-Grenzen.
  for (const info of bqInfo.values()) {
    if (info.gaps.length === 0) continue;
    info.gaps.sort((a, b) => a.start - b.start);
    const stops: string[] = ["#000 0px"];
    for (const g of info.gaps) {
      const a = g.start.toFixed(2);
      const b = g.end.toFixed(2);
      stops.push(`#000 ${a}px`);
      stops.push(`transparent ${a}px`);
      stops.push(`transparent ${b}px`);
      stops.push(`#000 ${b}px`);
    }
    stops.push("#000 100%");
    const grad = `linear-gradient(to bottom, ${stops.join(", ")})`;
    const style = `-webkit-mask-image:${grad};mask-image:${grad};-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-size:100% 100%;mask-size:100% 100%;`;
    decorations.push(
      Decoration.node(
        info.bqStart,
        info.bqEnd,
        { style },
        { key: `bq-mask@${info.bqStart}@${info.gaps.length}` },
      ),
    );
  }

  return { decorations, paragraphsWithSoftBreak };
}

type SpacerOpts = {
  inBlockquote: boolean;
};

function buildSpacerDecoration(pos: number, height: number, opts: SpacerOpts): Decoration {
  return Decoration.widget(
    pos,
    () => {
      // 2-Layer-Struktur (BugFix 2026-05-21 — Caret-Höhen-Bug auf
      // Seitenende):
      //
      // Vorher: 1 Inline-Block mit width:100% UND height = page-gap.
      //   Effekt: Browser-Line-Box, in der der Cursor landet, ist so
      //   hoch wie der gesamte Spacer → Caret wird visuell auf die
      //   volle Page-Gap-Höhe ausgedehnt (langer Strich durch den Tisch).
      //
      // Jetzt: Wrapper (display:contents) mit zwei Kindern.
      //   1. Trigger-Span: display:inline-block; width:100%; height:0.
      //      Forciert den Zeilenumbruch der vorhergehenden Text-Zeile
      //      (Browser behandelt sie als „gewrappt", nicht als „letzte
      //      Zeile vor Block-Element" → text-align: justify greift
      //      auch auf die letzte sichtbare Zeile auf der Seite).
      //      Höhe 0 → Line-Box bleibt natürliche Textzeilen-Höhe → Caret
      //      hat normale Größe.
      //   2. Gap-Span: display:block; height = page-gap. Sitzt als
      //      Block-Element auf seiner eigenen Zeile, nimmt den Platz
      //      ein, ohne die vorhergehende Line-Box zu beeinflussen.
      //      Da Widget-Decorations standardmäßig contenteditable=false
      //      sind, kann der Caret hier nicht reinklicken.
      const wrap = document.createElement("span");
      wrap.className = "a5-soft-break-spacer";
      wrap.setAttribute("data-soft-break", "1");
      wrap.setAttribute("aria-hidden", "true");
      if (opts.inBlockquote) {
        wrap.setAttribute("data-in-blockquote", "1");
      }
      // display:contents → der Wrapper rendert KEINE eigene Box; seine
      // Kinder werden als direkte Kinder des Paragraphs behandelt.
      wrap.style.cssText =
        "display:contents;user-select:none;pointer-events:none;";

      const trigger = document.createElement("span");
      trigger.className = "a5-soft-break-spacer__trigger";
      trigger.style.cssText =
        "display:inline-block;width:100%;height:0;line-height:0;vertical-align:top;user-select:none;pointer-events:none;";
      wrap.appendChild(trigger);

      const gap = document.createElement("span");
      gap.className = "a5-soft-break-spacer__gap";
      gap.style.cssText = `display:block;height:${height}px;line-height:0;margin:0;padding:0;user-select:none;pointer-events:none;`;
      wrap.appendChild(gap);

      return wrap;
    },
    {
      side: -1,
      ignoreSelection: true,
      key: `soft-break@${pos}@${Math.round(height)}@${opts.inBlockquote ? "bq" : ""}`,
    },
  );
}

// Block-Push-Spacer (Fix 2026-05-19): wird VOR einem Block eingesetzt, dessen
// natürlicher Flow auf Seite N startet, aber komplett (oder zu großen Teilen)
// in der Page-Gap oder auf Folgeseite überläuft. Wir schieben den GANZEN Block
// auf die nächste Seite. Wird als Block-Widget gerendert (display:block, eigene
// Höhe), das vor dem Block einfügt und nicht editierbar ist.
function buildBlockPushDecoration(pos: number, height: number): Decoration {
  return Decoration.widget(
    pos,
    () => {
      const div = document.createElement("div");
      div.className = "a5-block-push-spacer";
      div.setAttribute("data-block-push", "1");
      div.setAttribute("aria-hidden", "true");
      div.style.cssText = `display:block;height:${height}px;line-height:0;margin:0;padding:0;user-select:none;pointer-events:none;`;
      return div;
    },
    {
      side: -1,
      ignoreSelection: true,
      key: `block-push@${pos}@${Math.round(height)}`,
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
