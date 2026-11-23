import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { DecorationSet, type EditorView } from "@tiptap/pm/view";
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
