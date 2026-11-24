import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { isHyphenationReady } from "@/lib/hyphenation";
import { HYPHEN_CLASS, hyphenationSuppressed, isHyphenationPoint } from "./Hyphenation";

// PROJ-35 Schritt 3: Trennregeln, die erst das Setzen der Zeilen und Seiten zeigt.
//   AC-8: Höchstens 3 Zeilen in Folge enden mit einem Trennstrich.
//   AC-9: Die letzte Zeile einer Seite endet nie mit einem Trennstrich.
// Der Seiten-Takt schaltet dafür einzelne Trennstellen ab, misst den Absatz neu
// und setzt weiter, alles im selben Durchgang vor dem Zeichnen. Zum Messen wird
// eine Markierung per Klasse ausgeblendet; am Ende des Durchgangs übernimmt das
// Trenn-Plugin die Abschaltung (die Markierung fällt dann ganz weg).

export const MAX_HYPHENATED_LINES = 3;
const OFF_CLASS = "a5-shy-off";

/**
 * Index des Trennstrichs, mit dem eine Folge zu lang wird, sonst -1.
 * `lines`: Zeilennummern der Zeilen, die mit einem Trennstrich enden, aufsteigend.
 */
export function overlongRunIndex(lines: number[], max = MAX_HYPHENATED_LINES): number {
  let run = 0;
  for (let i = 0; i < lines.length; i += 1) {
    run = i > 0 && lines[i] === lines[i - 1] + 1 ? run + 1 : 1;
    if (run > max) return i;
  }
  return -1;
}

/** Zeilenoberkanten eines Absatzes im natürlichen Fluss. */
function lineTops(block: HTMLElement): number[] {
  const range = document.createRange();
  range.selectNodeContents(block);
  const tops: number[] = [];
  for (const rect of Array.from(range.getClientRects()).sort((a, b) => a.top - b.top)) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    const last = tops[tops.length - 1];
    if (last === undefined || Math.abs(last - rect.top) >= 2) tops.push(rect.top);
  }
  return tops;
}

/** Markierungen, an denen die Zeile gerade umbricht (der Trennstrich ist sichtbar). */
function visibleHyphens(block: HTMLElement): HTMLElement[] {
  return Array.from(block.querySelectorAll<HTMLElement>(`.${HYPHEN_CLASS}:not(.${OFF_CLASS})`)).filter(
    (el) => el.getBoundingClientRect().width > 0.5,
  );
}

function positionOf(view: EditorView, el: HTMLElement): number | null {
  try {
    return view.posAtDOM(el, 0);
  } catch {
    return null;
  }
}

// AC-8 hängt nur am Absatztext (und der festen A5-Breite). Das Ergebnis wird je
// Absatz-Knoten gemerkt: Beim Tippen wird nur der geänderte Absatz neu gemessen.
// Werte sind Abstände vom Absatzanfang.
const runCache = new WeakMap<PMNode, number[]>();
// Nach einer Abschaltung am Seitenende bricht der Rest des Absatzes neu um, die
// Folgen danach werden neu begrenzt. Das Ergebnis hängt am Absatztext und an
// den Stellen, die am Seitenende abgeschaltet sind. Schlüssel: diese Stellen.
const pageRunCache = new WeakMap<PMNode, Map<string, number[]>>();
// Ein Absatz voller langer Wörter kann viele Korrekturen brauchen.
const MAX_RUN_FIXES = 60;

export type HyphenLayout = {
  /** Steht hier eine Trennstelle, an der die Zeile gerade umbrechen kann? */
  isBreak(pos: number): boolean;
  /** AC-9: Trennstelle am Seitenende abschalten. Danach den Absatz neu messen. */
  hidePageEnd(block: HTMLElement, node: PMNode, nodePos: number, pos: number): boolean;
  /** Abschaltungen am Seitenende verwerfen (vor einem weiteren Durchgang). */
  resetPageEnds(): void;
  /** Ergebnis für das Trenn-Plugin. */
  result(): { lines: number[]; page: number[] };
  /** Ausblendungen zurücknehmen, nachdem das Plugin übernommen hat. */
  cleanup(root: HTMLElement): void;
};

/**
 * Bereitet den Durchgang vor: Abschaltungen nach AC-8 für alle Absätze
 * bestimmen (gemerkte übernehmen, neue messen). Erwartet den natürlichen Fluss
 * ohne Seiten-Spacer und ohne Abschaltungen am Seitenende.
 */
export function prepareHyphenLayout(view: EditorView): HyphenLayout {
  const lines = new Set<number>();
  const page = new Set<number>();
  const pageElements = new Map<number, HTMLElement>();
  const applied = new Set(hyphenationSuppressed(view.state).lines);

  const hide = (el: HTMLElement, pos: number, into: Set<number>) => {
    el.classList.add(OFF_CLASS);
    into.add(pos);
  };

  /** Begrenzt Folgen getrennter Zeilen in einem Absatz, meldet abgeschaltete Stellen. */
  const limitRuns = (block: HTMLElement, into: Set<number>) => {
    for (let round = 0; round < MAX_RUN_FIXES; round += 1) {
      const hyphens = visibleHyphens(block);
      if (hyphens.length <= MAX_HYPHENATED_LINES) return;
      const tops = lineTops(block);
      const lineOf = (el: HTMLElement) => {
        const top = el.getBoundingClientRect().top;
        let best = 0;
        for (let i = 1; i < tops.length; i += 1) {
          if (Math.abs(tops[i] - top) < Math.abs(tops[best] - top)) best = i;
        }
        return best;
      };
      const index = overlongRunIndex(hyphens.map(lineOf));
      if (index < 0) return;
      const pos = positionOf(view, hyphens[index]);
      if (pos === null) return;
      hide(hyphens[index], pos, into);
    }
  };

  view.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const start = pos + 1;
    const cached = runCache.get(node);
    if (cached) {
      for (const offset of cached) {
        const at = start + offset;
        lines.add(at);
        if (applied.has(at)) continue;
        // Gemerkt, aber im Plugin noch nicht abgeschaltet (etwa nach Rückgängig).
        const block = view.nodeDOM(pos);
        if (!(block instanceof HTMLElement)) continue;
        for (const el of Array.from(block.querySelectorAll<HTMLElement>(`.${HYPHEN_CLASS}`))) {
          if (positionOf(view, el) === at) el.classList.add(OFF_CLASS);
        }
      }
      return false;
    }
    const block = view.nodeDOM(pos);
    if (!(block instanceof HTMLElement)) return false;
    const found = new Set<number>();
    if (block.querySelectorAll(`.${HYPHEN_CLASS}`).length > MAX_HYPHENATED_LINES) {
      limitRuns(block, found);
    }
    // Schon abgeschaltete Stellen dieses Absatzes gehören weiter dazu.
    for (const at of applied) if (at > pos && at < pos + node.nodeSize) found.add(at);
    for (const at of found) lines.add(at);
    // Erst mit geladenem Wörterbuch stehen die Trennstellen fest; vorher würde
    // „nichts abzuschalten" gemerkt und später nie mehr geprüft.
    if (isHyphenationReady()) runCache.set(node, [...found].map((at) => at - start));
    return false;
  });

  // Abschaltungen am Seitenende je Absatz in diesem Durchgang (Abstände).
  const pageEndsByNode = new Map<PMNode, number[]>();
  const elementsAt = (block: HTMLElement) => {
    const map = new Map<number, HTMLElement>();
    for (const el of Array.from(block.querySelectorAll<HTMLElement>(`.${HYPHEN_CLASS}`))) {
      const at = positionOf(view, el);
      if (at !== null) map.set(at, el);
    }
    return map;
  };

  return {
    isBreak: (pos) => !lines.has(pos) && !page.has(pos) && isHyphenationPoint(view.state, pos),
    hidePageEnd(block, node, nodePos, pos) {
      if (page.has(pos) || lines.has(pos)) return false;
      const elements = elementsAt(block);
      const el = elements.get(pos);
      if (!el) return false;
      hide(el, pos, page);
      pageElements.set(pos, el);

      // Ohne diese Trennung bricht der Rest des Absatzes neu um. Folgen danach
      // werden wieder begrenzt. Gleicher Absatz und gleiche Seitenenden: gemerktes
      // Ergebnis übernehmen, ohne neu zu messen.
      const start = nodePos + 1;
      const ends = [...(pageEndsByNode.get(node) ?? []), pos - start];
      pageEndsByNode.set(node, ends);
      const key = ends.join(",");
      const known = pageRunCache.get(node)?.get(key);
      if (known) {
        for (const offset of known) {
          const at = start + offset;
          const target = elements.get(at);
          if (!target || page.has(at)) continue;
          hide(target, at, page);
          pageElements.set(at, target);
        }
        return true;
      }
      const found = new Set<number>();
      limitRuns(block, found);
      for (const at of found) {
        page.add(at);
        const target = elements.get(at);
        if (target) pageElements.set(at, target);
      }
      if (isHyphenationReady()) {
        const perNode = pageRunCache.get(node) ?? new Map<string, number[]>();
        perNode.set(key, [...found].map((at) => at - start));
        pageRunCache.set(node, perNode);
      }
      return true;
    },
    resetPageEnds() {
      for (const el of pageElements.values()) el.classList.remove(OFF_CLASS);
      pageElements.clear();
      page.clear();
      pageEndsByNode.clear();
    },
    result: () => ({ lines: [...lines], page: [...page] }),
    cleanup(root) {
      for (const el of Array.from(root.querySelectorAll(`.${OFF_CLASS}`))) el.classList.remove(OFF_CLASS);
    },
  };
}
