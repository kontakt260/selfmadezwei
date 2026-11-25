import { Decoration, type EditorView } from "@tiptap/pm/view";
import { isHyphenationPoint } from "./Hyphenation";
import type { HyphenLayout } from "./hyphenationLayout";

type Geometry = {
  pageHeight: number;
  marginTop: number;
  marginBottom: number;
  gap: number;
  stride: number;
  contentHeight: number;
};

export function computeDecorations(
  view: EditorView,
  fg: HTMLElement,
  geom: Geometry,
  // PROJ-34: Setzt Bildabschnitte und Umbrüche, sobald der Text darüber feststeht.
  placeBlock: (kind: "pageBreak" | "imageSection", dom: HTMLElement, shift: number) => void,
  // PROJ-35: Trennstellen; am Seitenende wird die Trennung abgeschaltet (AC-9).
  hyphens?: HyphenLayout,
): { decorations: Decoration[]; paragraphsWithSoftBreak: Set<HTMLElement> } {
  const fgTop = fg.getBoundingClientRect().top;
  // UI-Zoom: Gemessene Werte werden durch den Zoom-Faktor geteilt, damit die
  // Engine wieder im LOGISCHEN A5-Koordinatensystem rechnet. Der Faktor wird
  // gemessen, nicht angenommen (siehe layoutZoom).
  const stackEl = fg.closest(".a5-stack") as HTMLElement | null;
  const zoom = stackEl ? layoutZoom(stackEl, fg) : 1;
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
  // Node-Decoration auf der Blockquote gebaut, die die Border
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
    if (node.type.name === "pageBreak" || node.type.name === "imageSection") {
      const blockDom = view.nodeDOM(pos);
      if (blockDom instanceof HTMLElement) {
        placeBlock(node.type.name, blockDom, interParaShift);
      }
      return false;
    }
    if (!node.isTextblock) return true;
    const nodeDom = view.nodeDOM(pos);
    if (!(nodeDom instanceof HTMLElement)) return true;

    // Prüfen ob dieser Textblock in einer Blockquote sitzt — wenn ja,
    // sammeln wir die Y-Bereiche aller Spacer pro Blockquote, um nach der
    // Traversierung eine Rand-Decoration auf der Blockquote zu
    // setzen (Border wird in diesen Bereichen sauber ausgeblendet).
    const $pos = view.state.doc.resolve(pos);

    // PROJ-34: Die leere Schreibzeile hinter einem Abschnitt am Kapitelende ist
    // kein Inhalt. Sie erzeugt keine eigene Seite und wird nicht gedruckt.
    if (
      node.content.size === 0 &&
      $pos.depth === 0 &&
      pos + node.nodeSize === view.state.doc.content.size &&
      $pos.nodeBefore?.type.name === "imageSection"
    ) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, { class: "a5-trailing-line" }),
      );
      return false;
    }

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

    // Listenpunkt: Ist dieser Textblock der erste Absatz eines Listenpunkts,
    // muss ein Push des GANZEN Absatzes vor dem `<li>` ansetzen, nicht im
    // Absatz. Der Marker („•" / „1.") hängt an der ersten Zeile des
    // Listenpunkts — ein Spacer im Absatz ließe ihn allein auf der alten
    // Seite zurück, während der Text auf die neue Seite wandert
    // (Bug 2026-11-16).
    let listItemPush: { pos: number; dom: HTMLElement } | null = null;
    if ($pos.depth > 0 && $pos.parent.type.name === "listItem" && $pos.index() === 0) {
      const liPos = $pos.before($pos.depth);
      const liDom = view.nodeDOM(liPos);
      if (liDom instanceof HTMLElement) listItemPush = { pos: liPos, dom: liDom };
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
          decorations.push(
            listItemPush
              ? buildBlockPushDecoration(
                  listItemPush.pos,
                  delta - uncollapsedMargin(listItemPush.dom),
                )
              : buildBlockPushDecoration(pos, delta),
          );
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
    let endFrameIdx = Math.max(
      startFrameIdx,
      Math.floor((blockBottom - 1) / geom.stride),
    );

    const range = document.createRange();
    range.selectNodeContents(nodeDom);
    let lineRects = mergeLineRects(Array.from(range.getClientRects()));
    if (lineRects.length === 0) return false;

    let currentFrameIdx = startFrameIdx;
    let cumulativeShift = interParaShift;
    let thisParaSpacerHeight = 0;
    let i = 0;
    // PROJ-35: Wie oft in diesem Absatz eine Trennung am Seitenende abgeschaltet wurde.
    let pageEndHides = 0;

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

        if (delta > 0.5 && pushIdx === 0 && listItemPush) {
          // Ganzer erster Absatz eines Listenpunkts wandert auf die
          // Folgeseite → Block-Push VOR dem `<li>`, damit der Marker
          // mitwandert (siehe listItemPush oben).
          decorations.push(
            buildBlockPushDecoration(
              listItemPush.pos,
              delta - uncollapsedMargin(listItemPush.dom),
            ),
          );
          cumulativeShift += delta;
          thisParaSpacerHeight += delta;
          currentFrameIdx++;
          i = pushIdx + 1;
          if (currentFrameIdx > endFrameIdx + 1) break;
          continue;
        }

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
            let atHyphen = false;
            while (insertPos > blockStart) {
              const ch = view.state.doc.textBetween(insertPos - 1, insertPos);
              if (ch === "" || WS_RE.test(ch)) break;
              // PROJ-35: Eine Trennstelle steht nicht mehr im Text, sondern als
              // Markierung daneben. Bricht die Zeile dort, gilt sie wie früher
              // das Trennzeichen als Zeilenanfang, sonst bräche der Rest des
              // Absatzes anders um als gemessen.
              if (hyphens ? hyphens.isBreak(insertPos) : isHyphenationPoint(view.state, insertPos)) {
                atHyphen = true;
                break;
              }
              insertPos--;
            }
            // PROJ-35 AC-9: Die Seite würde mit einem Trennstrich enden. Diese
            // Trennstelle wird abgeschaltet, der Absatz neu gemessen und die
            // Seitengrenze noch einmal gesucht (ohne `i` weiterzuzählen).
            if (
              atHyphen &&
              hyphens &&
              pageEndHides < 12 &&
              hyphens.hidePageEnd(nodeDom, node, pos, insertPos)
            ) {
              pageEndHides += 1;
              lineRects = mergeLineRects(Array.from(range.getClientRects()));
              if (lineRects.length === 0) break;
              const remeasured = (nodeDom.getBoundingClientRect().bottom - fgTop) / zoom + interParaShift;
              endFrameIdx = Math.max(startFrameIdx, Math.floor((remeasured - 1) / geom.stride));
              continue;
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
            // Der Spacer besteht aus Trigger-Zeile + Gap-Block (siehe
            // buildSpacerDecoration). Die Trigger-Zeile ist eine eigene
            // Line-Box mit der Strut-Höhe des Absatzes (= line-height):
            // sie schiebt den Folgetext bereits um eine Zeilenhöhe nach
            // unten. Der Gap-Block darf deshalb nur den Rest von `delta`
            // einnehmen — sonst beginnt jede Folgeseite eine Zeile zu tief
            // und der Versatz summiert sich über die Seiten (Bug
            // 2026-11-15: Seite n startet n−1 Zeilen unter dem
            // Content-Top, Text läuft unten aus der Seite).
            const triggerLineHeight = lineBoxHeight(nodeDom, pushedLine.height / zoom);
            decorations.push(
              buildSpacerDecoration(insertPos, delta, triggerLineHeight, {
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
  // Node-Decoration emittieren, die den linken Rand in diesen Y-Bereichen
  // ausspart — KEIN visueller Overlay (CLAUDE.md „Keine visuellen
  // Overlay-Hacks"): der Rand selbst wird mit Lücken gezeichnet, mit
  // hartem Übergang an den Spacer-Grenzen.
  for (const info of bqInfo.values()) {
    if (info.gaps.length === 0) continue;
    info.gaps.sort((a, b) => a.start - b.start);
    // Der Rand wird als Verlauf mit Lücken GEZEICHNET (Hintergrund in der
    // Border-Box, die echte Border-Farbe ist für diese Blockquote
    // transparent). Früher lag eine `mask-image` auf der ganzen
    // Blockquote — die schnitt aber auch den Text an der Box-Kante ab:
    // kursive Buchstaben ragen rechts leicht über die Box hinaus und
    // wurden gekappt (Bug 2026-11-16: „Sonnenaufgang", „Duft").
    const rule = "var(--a5-blockquote-rule-color)";
    const stops: string[] = [`${rule} 0px`];
    for (const g of info.gaps) {
      const a = g.start.toFixed(2);
      const b = g.end.toFixed(2);
      stops.push(`${rule} ${a}px`);
      stops.push(`transparent ${a}px`);
      stops.push(`transparent ${b}px`);
      stops.push(`${rule} ${b}px`);
    }
    stops.push(`${rule} 100%`);
    const grad = `linear-gradient(to bottom, ${stops.join(", ")})`;
    const style =
      `border-left-color:transparent;background-image:${grad};` +
      "background-repeat:no-repeat;background-origin:border-box;background-clip:border-box;" +
      "background-position:left top;background-size:var(--a5-blockquote-rule-width) 100%;";
    decorations.push(
      Decoration.node(
        info.bqStart,
        info.bqEnd,
        { style },
        { key: `bq-rule@${info.bqStart}@${info.gaps.map((g) => `${Math.round(g.start)}-${Math.round(g.end)}`).join("_")}` },
      ),
    );
  }

  return { decorations, paragraphsWithSoftBreak };
}

type SpacerOpts = {
  inBlockquote: boolean;
};

// Höhe der Line-Box, die der Trigger-Span im Absatz `block` belegt: die
// Zeile enthält nur den Strut des Absatzes (font-size × line-height) und
// den 0 px hohen Inline-Block, ist also genau so hoch wie eine Textzeile.
// getComputedStyle liefert für line-height den aufgelösten px-Wert; fällt
// das aus (z. B. „normal"), nehmen wir die gemessene Höhe der Textzeile.
export function lineBoxHeight(block: HTMLElement, fallback: number): number {
  const lh = parseFloat(getComputedStyle(block).lineHeight);
  return Number.isFinite(lh) && lh > 0 ? lh : fallback;
}

function buildSpacerDecoration(
  pos: number,
  // Gesamtverschiebung des Folgetexts (Trigger-Zeile + Gap-Block).
  totalShift: number,
  // Höhe, die die Trigger-Zeile davon bereits einnimmt.
  triggerLineHeight: number,
  opts: SpacerOpts,
): Decoration {
  const gapHeight = Math.max(0, totalShift - triggerLineHeight);
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
      //   2. Gap-Span: display:block; height = Gesamtverschiebung minus
      //      Trigger-Zeile (die Trigger-Zeile selbst ist eine Line-Box in
      //      Absatz-Zeilenhöhe, siehe lineBoxHeight). Sitzt als Block-
      //      Element auf seiner eigenen Zeile, nimmt den Platz ein, ohne
      //      die vorhergehende Line-Box zu beeinflussen.
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
      gap.style.cssText = `display:block;height:${gapHeight}px;line-height:0;margin:0;padding:0;user-select:none;pointer-events:none;`;
      wrap.appendChild(gap);

      return wrap;
    },
    {
      side: -1,
      ignoreSelection: true,
      key: `soft-break@${pos}@${Math.round(totalShift)}@${Math.round(gapHeight)}@${opts.inBlockquote ? "bq" : ""}`,
    },
  );
}

// Ein Block-Push-Spacer zwischen zwei Blöcken hebt deren Margin-Collapsing
// auf: vorher teilten sich Vorgänger-Unterrand und eigener Oberrand den
// größeren der beiden Werte, mit dem Spacer dazwischen zählen beide voll.
// Der Block rutscht dadurch um den KLEINEREN der beiden Ränder zusätzlich
// nach unten. Diese Funktion liefert genau diesen Betrag, damit die
// Spacer-Höhe ihn abziehen kann und die erste Zeile exakt am Content-Top
// der Folgeseite landet. Ist der Block das erste Kind, kollabiert sein
// Oberrand mit dem des Elternelements (z. B. `<ul>`).
function uncollapsedMargin(el: HTMLElement): number {
  const own = parseFloat(getComputedStyle(el).marginTop) || 0;
  if (own <= 0) return 0;
  let prev = el.previousElementSibling;
  while (prev && prev.classList.contains("a5-block-push-spacer")) {
    prev = prev.previousElementSibling;
  }
  const other = prev
    ? parseFloat(getComputedStyle(prev).marginBottom) || 0
    : el.parentElement
      ? parseFloat(getComputedStyle(el.parentElement).marginTop) || 0
      : 0;
  return Math.max(0, Math.min(own, other));
}

// Block-Push-Spacer (Fix 2026-05-19): wird VOR einem Block eingesetzt, dessen
// natürlicher Flow auf Seite N startet, aber komplett (oder zu großen Teilen)
// in der Page-Gap oder auf Folgeseite überläuft. Wir schieben den GANZEN Block
// auf die nächste Seite. Wird als Block-Widget gerendert (display:block, eigene
// Höhe), das vor dem Block einfügt und nicht editierbar ist.
function buildBlockPushDecoration(pos: number, rawHeight: number): Decoration {
  const height = Math.max(0, rawHeight);
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

/**
 * Faktor zwischen gemessenen Bildschirmmaßen (getBoundingClientRect,
 * getClientRects) und den A5-Maßen der Seite.
 *
 * Chrome und Firefox liefern unter CSS-`zoom` skalierte Werte, Safari liefert
 * unskalierte (WebKit-Bug 77998). Früher wurde immer durch die Zoom-Stufe
 * geteilt; in Safari stimmte die Geometrie dann bei jeder Stufe außer 100 %
 * nicht, und der Text sprang (Jakob, 2026-11-25). Deshalb wird an der Breite
 * des Vordergrunds gemessen, welcher der beiden Fälle vorliegt.
 */
export function layoutZoom(stack: HTMLElement, fg?: HTMLElement | null): number {
  const cs = getComputedStyle(stack);
  const uiZoom = parseFloat(cs.getPropertyValue("--ui-zoom") || "1") || 1;
  if (uiZoom === 1) return 1;
  const target = fg ?? (stack.querySelector(".a5-stack__fg") as HTMLElement | null) ?? stack;
  const rootFontPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const logical = parseLen(cs.getPropertyValue("--a5-page-width"), rootFontPx, 559.37);
  const measured = target.getBoundingClientRect().width;
  if (!(measured > 0) || !(logical > 0)) return uiZoom;
  const ratio = measured / logical;
  return Math.abs(ratio - uiZoom) <= Math.abs(ratio - 1) ? uiZoom : 1;
}

export function readGeometry(stack: HTMLElement): Geometry | null {
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
