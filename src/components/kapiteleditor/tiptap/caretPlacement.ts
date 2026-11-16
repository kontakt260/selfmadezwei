import { Selection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

// Cursor-Platzierung bei Klicks, die NICHT auf Text landen (PROJ-5,
// 2026-11-16).
//
// Zwischen zwei Seiten liegt im Editor eine „tote Zone": der Rest der alten
// Seite, ihr unterer Rand, der Zwischenraum auf dem Tisch und der obere Rand
// der neuen Seite. Technisch ist das ein nicht editierbarer Spacer (Soft-
// Break im Absatz, Block-Push zwischen Blöcken) oder ein manueller
// Seitenumbruch. Der Browser findet für Klicks dort keine sinnvolle
// Textposition — der Cursor sprang an den Dokumentanfang oder ans
// Dokumentende. Gleiches galt für Klicks in den linken/rechten Seitenrand.
//
// Regel (wie in Word/Docs): Der Cursor landet in der nächstgelegenen Zeile
// der Seite, auf die geklickt wurde — horizontal an der Klickposition.

type Zone = { top: number; bottom: number };

const ZONE_SELECTOR = ".a5-soft-break-spacer__gap, .a5-block-push-spacer, .a5-page-break";

function collectZones(view: EditorView): Zone[] {
  const zones: Zone[] = [];
  view.dom.querySelectorAll<HTMLElement>(ZONE_SELECTOR).forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) return;
    let top = rect.top;
    if (el.classList.contains("a5-soft-break-spacer__gap")) {
      // Über dem Gap-Block liegt die leere Trigger-Zeile des Soft-Breaks
      // (eine Zeilenhöhe) — sie gehört zur toten Zone.
      const block = el.closest("p, li, blockquote") as HTMLElement | null;
      const cssHeight = parseFloat(el.style.height);
      const zoom = cssHeight > 0 ? rect.height / cssHeight : 1;
      const lineHeight = block ? parseFloat(getComputedStyle(block).lineHeight) : NaN;
      if (Number.isFinite(lineHeight)) top -= lineHeight * zoom;
    }
    zones.push({ top, bottom: rect.bottom });
  });
  // Direkt aufeinanderfolgende Zonen (z. B. zwei Seitenumbrüche in Folge)
  // zu einer Zone verschmelzen.
  zones.sort((a, b) => a.top - b.top);
  const merged: Zone[] = [];
  for (const zone of zones) {
    const last = merged[merged.length - 1];
    if (last && zone.top <= last.bottom + 1) last.bottom = Math.max(last.bottom, zone.bottom);
    else merged.push({ ...zone });
  }
  return merged;
}

// Index der Seite, zu der die Y-Koordinate gehört. Im Zwischenraum zwischen
// zwei Seiten entscheidet dessen Mitte.
function pageIndexAt(frames: DOMRect[], y: number): number {
  for (let i = 0; i < frames.length; i++) {
    if (y <= frames[i].bottom) {
      if (y >= frames[i].top || i === 0) return i;
      const gapMiddle = (frames[i - 1].bottom + frames[i].top) / 2;
      return y < gapMiddle ? i - 1 : i;
    }
  }
  return Math.max(0, frames.length - 1);
}

/**
 * Setzt den Cursor in die Zeile, die dem Punkt am nächsten liegt.
 * Gibt `false` zurück, wenn keine Position gefunden wurde (Aufrufer nutzt
 * dann sein bisheriges Verhalten).
 */
export function placeCaretNearPoint(
  view: EditorView,
  clientX: number,
  clientY: number,
  extendSelection = false,
): boolean {
  const editorRect = view.dom.getBoundingClientRect();
  if (editorRect.width <= 0 || editorRect.height <= 0) return false;

  // Unterhalb des Textes (Weißraum der letzten Seite) → Dokumentende,
  // oberhalb (Kopf der ersten Seite) → Dokumentanfang. So lässt sich nach
  // einem Klick ins Leere direkt weiterschreiben.
  if (clientY > editorRect.bottom || clientY < editorRect.top) {
    const { doc, selection } = view.state;
    const edge = clientY > editorRect.bottom ? Selection.atEnd(doc) : Selection.atStart(doc);
    const next = extendSelection
      ? TextSelection.create(doc, selection.anchor, edge.head)
      : edge;
    view.dispatch(view.state.tr.setSelection(next));
    view.focus();
    return true;
  }

  const x = Math.min(Math.max(clientX, editorRect.left + 2), editorRect.right - 2);
  let y = Math.min(Math.max(clientY, editorRect.top + 2), editorRect.bottom - 2);
  // Suchrichtung für Selection.near: -1 = zum Textende davor, 1 = zum
  // Textanfang danach.
  let bias: 1 | -1 = clientY < editorRect.top ? 1 : -1;

  const zone = collectZones(view).find((z) => clientY >= z.top && clientY <= z.bottom);
  if (zone) {
    const stack = view.dom.closest(".a5-stack");
    const frames = stack
      ? Array.from(stack.querySelectorAll(".a5-page-frame")).map((f) => f.getBoundingClientRect())
      : [];
    const above = zone.top - 6;
    const below = zone.bottom + 6;
    const hasAbove = above > editorRect.top;
    const hasBelow = below < editorRect.bottom;
    const onUpperPage =
      frames.length > 0
        ? pageIndexAt(frames, clientY) <= pageIndexAt(frames, above)
        : clientY - zone.top < zone.bottom - clientY;
    if ((onUpperPage && hasAbove) || !hasBelow) {
      y = above;
      bias = -1;
    } else {
      y = below;
      bias = 1;
    }
  }

  const found = view.posAtCoords({ left: x, top: y });
  if (!found) return false;
  const { doc, selection } = view.state;
  const near = Selection.near(doc.resolve(found.pos), bias);
  const next = extendSelection
    ? TextSelection.create(doc, selection.anchor, near.head)
    : near;
  view.dispatch(view.state.tr.setSelection(next));
  view.focus();
  return true;
}

/** true, wenn der Punkt in einer toten Zone des Editors liegt. */
export function isInDeadZone(view: EditorView, clientY: number): boolean {
  return collectZones(view).some((z) => clientY >= z.top && clientY <= z.bottom);
}
