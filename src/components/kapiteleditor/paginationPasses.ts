"use client";

import { maxGroupScale, planRowGroups } from "@/lib/kapiteleditor/imageRowLayout";

// ---------------------------------------------------------------------------
// Pagination-Engine (Refinement 2026-05-18 — Spec PROJ-5 Sektion J)
// ---------------------------------------------------------------------------
//
// Delta-Algorithmus: KEIN Reset, KEIN State-Tracking, KEIN Body-Höhe-Schwanken.
//
// Pro Recalc:
//   1. Items in DOM-Reihenfolge sammeln (Editor-Blöcke, Bild-Reihen, Page-Breaks)
//   2. Für jedes Item Live-Position auslesen (getBoundingClientRect)
//   3. Wenn der Item-Bottom die Content-Untergrenze SEINER aktuellen Seite
//      überschreitet → DELTA = nächste Seite Content-Top - aktuelle Position
//      Anwendung: style.marginTop = currentInlineMargin + delta
//   4. Wenn KEIN Overflow → keine Style-Mutation, keine Layout-Veränderung,
//      kein Scroll-Sprung.
//
// Weil wir Live-Positionen verwenden und nur Diffs anwenden, konvergiert das
// in einem Pass: nach jedem Push verschieben sich die Folgeelemente in Flow
// natürlich, ihr nächstes `getBoundingClientRect()` liefert die neue Position.
//
// Trade-off (akzeptiert für v1): SHRINK-Fall ist nicht abgedeckt. Wenn der
// Nutzer Inhalt LÖSCHT und ein vorher gepushter Block wieder auf die
// vorherige Seite passen würde, bleibt der Push bestehen → akkumulierte
// Leerseiten. Lösung kommt in v2 (Reset-on-Shrink mit Snap-Back-Detection).
export function recalcPagination(
  fg: HTMLElement,
  stack: HTMLElement,
  setPageCount: React.Dispatch<React.SetStateAction<number>>,
) {
  if (fg.getClientRects().length === 0) return;

  const root = document.documentElement;
  const rootFont = parseFloat(getComputedStyle(root).fontSize) || 16;
  const fgStyle = getComputedStyle(fg);
  const topMarginPx = parseFloat(fgStyle.paddingTop) || 0;
  const bottomMarginPx = parseFloat(fgStyle.paddingBottom) || 0;

  const stackStyle = getComputedStyle(stack);
  const pageHeightStr = stackStyle.getPropertyValue("--a5-page-height").trim() || "210mm";
  const gapStr = stackStyle.getPropertyValue("--a5-page-gap").trim() || "2.5rem";
  const frameH = cssLengthToPx(pageHeightStr, rootFont);
  const gapPx = cssLengthToPx(gapStr, rootFont);
  // UI-Zoom faktorieren: transform: scale auf .a5-stack skaliert visuell
  // alle Kind-Elemente, getBoundingClientRect reportet die skalierten
  // Werte. Wir teilen alle Mess-Rects durch zoom, damit die Pagination
  // weiterhin gegen die LOGISCHEN A5-Werte (CSS-Vars, 1×) rechnet.
  const zoom = parseFloat(stackStyle.getPropertyValue("--ui-zoom") || "1") || 1;

  if (frameH <= 0 || topMarginPx + bottomMarginPx >= frameH) return;

  const stridePx = frameH + gapPx;
  const pageContentHeight = frameH - topMarginPx - bottomMarginPx;

  // Items in DOM-Reihenfolge sammeln.
  const breaks = Array.from(fg.querySelectorAll<HTMLElement>(".a5-page-break"));
  // Wir IGNORIEREN Block-Push- und Soft-Break-Spacer (PaginationDecorations
  // hat sie als Widgets gesetzt). Sonst würde der Block-Push-Engine sie als
  // eigene "Blöcke" erkennen und nochmal pushen → kumulativer Overshoot.
  const editorBlocks = Array.from(
    fg.querySelectorAll<HTMLElement>(
      ".tiptap-editor > *:not(.a5-page-break):not(.a5-block-push-spacer):not(.a5-soft-break-spacer)",
    ),
  );
  // Nur Reihen mit echten Bildern nehmen an der Pagination teil. Der
  // leere „Bild hinzufügen"-Platzhalter ist Editor-Bedienelement und
  // steht nicht im Druck: er wird nie auf eine neue Seite geschoben und
  // zählt nicht zur Seitenzahl. Passt er nicht mehr in den Inhaltsbereich,
  // ragt er in den unteren Seitenrand (er ist kleiner als der Rand).
  // Vorher erzeugte er eine Phantomseite, sobald der Text die Seite fast
  // füllte — und diese Seite wurde als page_count gespeichert, womit die
  // buchweiten Seitenzahlen der Folgekapitel um eins verrutschten
  // (Bug 2026-11-16).
  const imageRows = Array.from(
    fg.querySelectorAll<HTMLElement>("[data-paginate-row]:not(.image-section-empty)"),
  );

  // PASS 0 — Reset alle bisherigen Push-Margins/Höhen, damit wir den
  // natürlichen Flow messen (Spec PROJ-5 „SHRINK-Case": wenn Inhalt
  // gelöscht wird, sollen vorher gepushte Margins zurückfallen und keine
  // Phantom-Leerseiten am Ende übriglassen). Reset und Re-Push laufen
  // beide synchron im selben rAF-Tick → keine sichtbaren Sprünge.
  for (const el of editorBlocks) {
    if (el.style.marginTop) el.style.marginTop = "";
  }
  for (const el of imageRows) {
    if (el.style.marginTop) el.style.marginTop = "";
    // Row-Image-Scale ebenfalls zurücksetzen, damit PASS A unten gegen
    // die natürliche (ungeskalierte) Reihen-Höhe entscheidet.
    if (el.style.getPropertyValue("--row-image-scale")) {
      el.style.removeProperty("--row-image-scale");
    }
  }
  // Break-Höhen NICHT in PASS 0 löschen: PASS A misst End-Sektion-Position,
  // die durch HR-Page-Break-Höhen mitbestimmt wird. Wenn wir HR-Höhen hier
  // auf den natürlichen ~40px zurücksetzen, schiebt das End-Sektion um die
  // gesammelte Push-Differenz nach oben → PASS A scalet falsch.
  // PASS 1 unten aktualisiert die Höhen ohnehin korrekt (kann auch
  // schrumpfen), also kein Bedarf für vorheriges Clear.
  // Layout nach Reset einmal erzwingen, damit die anschließenden
  // getBoundingClientRect-Aufrufe die natürlichen Positionen liefern.
  void fg.offsetHeight;

  const fgTop = fg.getBoundingClientRect().top;
  // PASS 1a — Page-Break-HRs SETTLEN, BEVOR PASS A misst.
  // Begründung (Bug 2026-05-20, Page 14 mixed scales): PASS A muss
  // gegen STABILE Positionen entscheiden. Wenn wir HRs erst nach PASS A
  // anpassen, schiebt das Wachstum der HR die End-Sektion nach unten,
  // und die zuvor von PASS A geplante Page-Group-Zuordnung passt
  // nicht mehr — Reihen rutschen auf andere Seiten als geplant und
  // teilen sich dort mit anders skalierten Reihen die Seite.
  const inFgContentRaw = (el: HTMLElement) =>
    (el.getBoundingClientRect().top - fgTop) / zoom - topMarginPx;
  const elHRaw = (el: HTMLElement) => el.getBoundingClientRect().height / zoom;
  const breaksSorted = [...breaks].sort(
    (a, b) => inFgContentRaw(a) - inFgContentRaw(b),
  );
  // Fixpoint-Iteration: jede HR-Höhen-Anpassung verschiebt nachfolgende
  // HRs. Eine einzige Runde verfehlt diese Cascade. Max 5 Runden.
  const settleHRs = () => {
    let changed = false;
    for (const br of breaksSorted) {
      const observedTop = inFgContentRaw(br);
      const observedHeight = elHRaw(br);
      const frameIdx = Math.max(0, Math.floor(observedTop / stridePx));
      const nextFrameContentTop = (frameIdx + 1) * stridePx;
      const nearestFrameContentTop = Math.round(observedTop / stridePx) * stridePx;
      const atFrameTop = Math.abs(observedTop - nearestFrameContentTop) < 1;
      const desiredHeight = atFrameTop
        ? stridePx
        : nextFrameContentTop - observedTop;
      if (desiredHeight > gapPx + 0.5 && Math.abs(desiredHeight - observedHeight) > 0.5) {
        br.style.height = `${desiredHeight}px`;
        changed = true;
      }
    }
    return changed;
  };
  for (let iter = 0; iter < 5; iter++) {
    if (!settleHRs()) break;
    void fg.offsetHeight;
  }
  // Reflow nach HR-Adjustment — End-Sektion sitzt jetzt an ihrer
  // endgültigen Position.
  void fg.offsetHeight;
  // Alle Positions-Werte werden durch zoom geteilt, damit die Pagination
  // im LOGISCHEN A5-Koordinatensystem rechnet, selbst wenn die DOM-
  // Rects durch transform: scale visuell skaliert sind.
  const inFgContent = (el: HTMLElement) =>
    (el.getBoundingClientRect().top - fgTop) / zoom - topMarginPx;
  const elH = (el: HTMLElement) => el.getBoundingClientRect().height / zoom;

  // PASS A — Per-Row-Image-Scaling für 1-spaltig-Bild-Sektionen
  // (Spec 2026-05-20 vom Nutzer):
  //   "wenn zwei bilder im 1x1 eingefügt sind, sollen sie auch auf die
  //    kapitel startseite passen; das dritte bild beginnt dann auf einer
  //    neuen seite und kann die ursprüngliche größe beibehalten."
  //   Gilt analog für die End-Sektion: erste K Reihen werden runter-
  //   skaliert, um auf die aktuelle Seite zu passen — aber nur solange
  //   Skala ≥ MIN_SCALE bleibt. Restliche Reihen fließen ungeskaliert
  //   via Block-Push auf die Folgeseite.
  const mmToPxLocal = (mm: number) => (mm / 25.4) * 96;
  const cmToPxLocal = (cm: number) => (cm / 2.54) * 96;
  const sectionContentWidth = mmToPxLocal(148) - cmToPxLocal(2) - cmToPxLocal(2.5);
  const naturalRowH1Col = sectionContentWidth * (2 / 3); // 3:2 bei voller Inhaltsbreite
  const sectionRowGap = mmToPxLocal(4);
  const sectionWrappers = Array.from(
    fg.querySelectorAll<HTMLElement>("[data-image-section-wrapper]"),
  );
  // Skalierung für START- UND END-Sektion: die ersten K Reihen werden
  // soweit verkleinert, dass sie auf die aktuelle Seite passen (Min-
  // Skala 0.65). Reihen darüber hinaus rutschen ungeskaliert via Block-
  // Push auf Folgeseiten — sodass das 2-cm-BottomMargin respektiert
  // wird ohne dass eine ansonsten passende Reihe leer auf die nächste
  // Seite gepusht wird (kein wasted space).
  // Iteratives Page-by-Page-Grouping: Wir packen N Reihen sequentiell auf
  // Seiten. Jede Page-Group erhält EINE uniforme Skala (Same-Size-Per-Page-
  // AC vom Nutzer 2026-05-20). Die erste Gruppe muss in den Restplatz der
  // aktuellen Seite passen; jede Folge-Gruppe in pageContentHeight.
  for (const wrapper of sectionWrappers) {
    const rows1Col = Array.from(
      wrapper.querySelectorAll<HTMLElement>(
        ":scope > [data-paginate-row][data-layout='1-spaltig']",
      ),
    );
    if (rows1Col.length === 0) continue;
    const firstRowTop = inFgContent(rows1Col[0]);
    const startFrameIdx = Math.max(0, Math.floor(firstRowTop / stridePx));
    const startFrameContentBottom = startFrameIdx * stridePx + pageContentHeight;
    const availableOnCurrentPage = Math.max(0, startFrameContentBottom - firstRowTop);

    // Reine Rechnung in `imageRowLayout.ts` (dort auch die Regeln und
    // Tests): passt auf den Restplatz nicht einmal eine Reihe mit
    // Mindest-Skala, bleibt die Seite ohne Bild — PASS 1b schiebt die
    // Reihen dann unskaliert auf die nächste Seite.
    const groups = planRowGroups({
      rows: rows1Col.length,
      availableOnCurrentPage,
      pageContentHeight,
      rowHeight: naturalRowH1Col,
      rowGap: sectionRowGap,
    });
    let cursor = 0;
    for (const group of groups) {
      if (group.scale < 1) {
        for (let i = cursor; i < cursor + group.count; i++) {
          rows1Col[i].style.setProperty("--row-image-scale", group.scale.toFixed(4));
        }
      }
      cursor += group.count;
    }
  }
  // Reflow nach Scale-Änderungen, damit die anschließenden
  // Block-Push-Messungen die neue Reihen-Höhe sehen.
  void fg.offsetHeight;

  // PASS 1b — Image-Row Block-Push.
  // HRs wurden bereits in PASS 1a vor PASS A gesettlet. Text-Block-Push
  // ist obsolet (Soft-Break-Engine in PaginationDecorations übernimmt das).
  // Hier nur noch Bild-Reihen prüfen und ggf. auf die nächste Seite schieben.
  const imageRowsSorted = [...imageRows].sort(
    (a, b) => inFgContent(a) - inFgContent(b),
  );
  for (const row of imageRowsSorted) {
    const observedTop = inFgContent(row);
    const observedHeight = elH(row);
    const observedBottom = observedTop + observedHeight;
    const frameIdx = Math.max(0, Math.floor(observedTop / stridePx));
    const frameContentBottom = frameIdx * stridePx + pageContentHeight;
    const nextFrameContentTop = (frameIdx + 1) * stridePx;

    // Skalierte Reihen werden GRUNDSÄTZLICH vertraut, ABER nur wenn sie
    // ihre Seite TATSÄCHLICH nicht verletzen. Wenn die skalierte Reihe
    // > 30 px über den Content-Bereich ragt, override PASS A's
    // Entscheidung und push.
    const hasScale = !!row.style.getPropertyValue("--row-image-scale");
    if (hasScale && observedBottom <= frameContentBottom + 30) continue;
    if (observedBottom > frameContentBottom + 0.5) {
      if (observedHeight > pageContentHeight + 0.5) continue;
      const delta = nextFrameContentTop - observedTop;
      if (delta > 0.5) {
        const currentMargin = parseFloat(row.style.marginTop) ||
          parseFloat(getComputedStyle(row).marginTop) || 0;
        row.style.marginTop = `${currentMargin + delta}px`;
      }
    }
  }

  // PASS Z — Post-hoc Same-Size-Per-Page-Normalisierung.
  // PASS A trifft optimale Group-Entscheidungen anhand der MESS-POSITIONEN
  // zum Zeitpunkt von PASS A. PaginationDecorations (PD) kann jedoch
  // ZEITGLEICH die Soft-Break-Spacer im Body anpassen → Body-Höhe wandert
  // → HRs verschieben sich → End-Sektion landet auf anderer Seite als
  // PASS A geplant hatte. Folge (Bug 2026-05-20 Page 14): Reihen mit
  // unterschiedlichen Skalen teilen sich eine Seite.
  // Fix: Nach PASS 1b sind die Positionen STABIL. Wir gruppieren erneut
  // nach Render-Seite und normalisieren auf die kleinste Skala der Gruppe.
  void fg.offsetHeight;
  const rowsByPage = new Map<number, HTMLElement[]>();
  for (const row of imageRows) {
    // Gruppierung via CENTER (nicht Top) — sonst landet eine Reihe, die
    // PASS 1b auf die nächste Seite gepusht hat, durch Fließkomma-
    // Rundung (z.B. logical top 833.5 vs stride 833.7) auf der FALSCHEN
    // Seite in PASS Z. Bug 2026-05-20: Row 2 pushed bei mt=191 zu
    // top≈833.5 → floor(833.5/833.7)=0, aber visuell auf Seite 2.
    const top = inFgContent(row);
    const h = elH(row);
    const center = top + h / 2;
    const page = Math.max(0, Math.floor(center / stridePx));
    if (!rowsByPage.has(page)) rowsByPage.set(page, []);
    rowsByPage.get(page)!.push(row);
  }
  for (const [, pageRows] of rowsByPage) {
    if (pageRows.length < 2) continue;
    let minScale = 1;
    for (const r of pageRows) {
      const s = parseFloat(r.style.getPropertyValue("--row-image-scale")) || 1;
      if (s < minScale) minScale = s;
    }
    if (minScale < 1) {
      for (const r of pageRows) {
        r.style.setProperty("--row-image-scale", minScale.toFixed(4));
      }
    }
  }

  // PASS 1d — Image-Row-Re-Push NACH allen Skalen-Änderungen.
  // PASS 1b hatte die Reihen gegen die UNSCALED-Layout-Position gepusht
  // (gleicher Race wie HRs). PASS A + PASS Z können danach Skalen ändern
  // → Inhalte über der Bild-Reihe verschieben sich → mt aus PASS 1b
  // passt nicht mehr (Bug 2026-05-21, Seite 8: End-Sektion-Bild ragt 88 px
  // in den Page-Gap vor Seite 8). Wir messen Reihen ein zweites Mal
  // gegen den endgültigen Layout-Stand und korrigieren mt ggf.
  void fg.offsetHeight;
  for (let iter = 0; iter < 5; iter++) {
    let anyChange = false;
    for (const row of imageRowsSorted) {
      const observedTop = inFgContent(row);
      const observedHeight = elH(row);
      // Page-Zuordnung via CENTER (analog PASS Z): wenn eine Reihe per
      // mt nahe an die Page-Boundary geschoben wurde, kann ihr Top
      // 1–88 px VOR dem Frame-Content-Top sitzen (Float-Rundung +
      // PD-Race). PASS 1b's Top-basierte Klassifizierung würde sie
      // dann als „auf voriger Seite überlaufend" einstufen — der
      // Push delta = (next_frame - top) wäre aber ~0, also kein Fix.
      // Center-basiert: die Reihe gehört zur Seite, deren Mitte sie
      // schneidet. Wenn ihr TOP < dieser Seiten-Content-Top liegt,
      // pushen wir bis zum Content-Top.
      const center = observedTop + observedHeight / 2;
      const pageIdx = Math.max(0, Math.floor(center / stridePx));
      const pageContentTop = pageIdx * stridePx;
      const pageContentBottom = pageIdx * stridePx + pageContentHeight;
      // Korrektur 1: Reihe ragt OBEN in den Page-Gap (Top < page-content-top)
      if (observedTop < pageContentTop - 0.5) {
        const delta = pageContentTop - observedTop;
        const currentMargin = parseFloat(row.style.marginTop) ||
          parseFloat(getComputedStyle(row).marginTop) || 0;
        row.style.marginTop = `${currentMargin + delta}px`;
        anyChange = true;
        continue;
      }
      // Korrektur 2: Reihe ragt UNTEN in den Page-Gap (Bottom > page-content-bottom)
      const observedBottom = observedTop + observedHeight;
      const hasScale = !!row.style.getPropertyValue("--row-image-scale");
      if (hasScale && observedBottom <= pageContentBottom + 30) continue;
      if (observedBottom > pageContentBottom + 0.5) {
        if (observedHeight > pageContentHeight + 0.5) continue;
        const nextFrameContentTop = (pageIdx + 1) * stridePx;
        const delta = nextFrameContentTop - observedTop;
        if (delta > 0.5) {
          const currentMargin = parseFloat(row.style.marginTop) ||
            parseFloat(getComputedStyle(row).marginTop) || 0;
          row.style.marginTop = `${currentMargin + delta}px`;
          anyChange = true;
        }
      }
    }
    if (!anyChange) break;
    void fg.offsetHeight;
    for (let hri = 0; hri < 3; hri++) {
      if (!settleHRs()) break;
      void fg.offsetHeight;
    }
  }

  // PASS 1c — HR-Re-Settling NACH allen Skalen-Änderungen.
  // PASS 1a hatte die HRs gegen die UNSCALED-Layout-Position gemessen
  // (PASS 0 hatte alle --row-image-scale gelöscht). PASS A + PASS Z
  // haben anschließend Skalen wieder gesetzt — Start-Sektion schrumpft
  // → Inhalte über HRs verschieben sich nach oben → die in PASS 1a
  // gesetzten HR-Höhen passen nicht mehr zum aktuellen observedTop.
  // Folge (Bug 2026-05-20, Seite 5 startet 88 px tief): die nächste
  // Seite beginnt nicht am Frame-Top.
  // Wir messen die HRs ein zweites Mal mit den ENDGÜLTIGEN Reihen-
  // Positionen und korrigieren ihre Höhen ggf.
  void fg.offsetHeight;
  for (let iter = 0; iter < 5; iter++) {
    let anyChange = false;
    for (const br of breaksSorted) {
      const observedTop = inFgContentRaw(br);
      const observedHeight = elHRaw(br);
      const frameIdx = Math.max(0, Math.floor(observedTop / stridePx));
      const nextFrameContentTop = (frameIdx + 1) * stridePx;
      const nearestFrameContentTop = Math.round(observedTop / stridePx) * stridePx;
      const atFrameTop = Math.abs(observedTop - nearestFrameContentTop) < 1;
      const desiredHeight = atFrameTop
        ? stridePx
        : nextFrameContentTop - observedTop;
      if (desiredHeight > gapPx + 0.5 && Math.abs(desiredHeight - observedHeight) > 0.5) {
        br.style.height = `${desiredHeight}px`;
        anyChange = true;
      }
    }
    if (!anyChange) break;
    void fg.offsetHeight;
  }

  // PASS 1e — Image-Row-Re-Push NACH PASS 1c's HR-Shrink.
  // PASS 1c hat HR-Höhen ggf. verkleinert (HR füllt nicht mehr ganz bis
  // zum nächsten Frame, weil Inhalt drüber durch PASS A/Z geschrumpft
  // war). Das schiebt Inhalte UNTERHALB des HR um den Shrink-Betrag
  // nach oben — End-Sektion-Bilder rutschen aus dem Page-Top hinaus,
  // ihre Tops liegen ~88 px VOR dem Frame-Content-Top (Bug 2026-05-21).
  // Wir korrigieren erneut center-basiert.
  void fg.offsetHeight;
  for (let iter = 0; iter < 5; iter++) {
    let anyChange = false;
    for (const row of imageRowsSorted) {
      const observedTop = inFgContent(row);
      const observedHeight = elH(row);
      const center = observedTop + observedHeight / 2;
      const pageIdx = Math.max(0, Math.floor(center / stridePx));
      const pageContentTop = pageIdx * stridePx;
      if (observedTop < pageContentTop - 0.5) {
        const delta = pageContentTop - observedTop;
        const currentMargin = parseFloat(row.style.marginTop) ||
          parseFloat(getComputedStyle(row).marginTop) || 0;
        row.style.marginTop = `${currentMargin + delta}px`;
        anyChange = true;
      }
    }
    if (!anyChange) break;
    void fg.offsetHeight;
  }

  // PASS G — Grow-Pass für untergröße Reihen (Audit-Folge 2026-05-21).
  // PASS A skaliert anfangs auf Basis einer Mess-Position, die später
  // durch HR-Settling + PD-Race + PASS 1e wandert. Wenn sich heraus-
  // stellt, dass eine Reihe auf einer Seite mit VIEL ungenutztem Platz
  // landet (Bug: Seite 4 zeigt End-Sektion-Bild bei Skala 0.65, obwohl
  // 369 px Restplatz übrig sind), soll die Skala zurückgewachsen werden
  // bis zum Maximum, das auf dieser Seite passt — capped bei 1.
  //
  // Same-Size-Per-Page bleibt erhalten: pro Seite wird die MAX zulässige
  // Skala aller Reihen auf dieser Seite ermittelt und einheitlich
  // angewendet.
  void fg.offsetHeight;
  {
    // Natürliche Reihen-Höhe (= scale 1) berechnen wir aus naturalRowH1Col
    // (bereits aus CSS-Vars ermittelt) — für 2-spaltig wäre der Wert
    // halbiert, aber PASS A skaliert nur 1-spaltig, also stimmt's hier.
    const rowsByPageGrow = new Map<number, HTMLElement[]>();
    for (const row of imageRows) {
      const top = inFgContent(row);
      const h = elH(row);
      const page = Math.max(0, Math.floor((top + h / 2) / stridePx));
      if (!rowsByPageGrow.has(page)) rowsByPageGrow.set(page, []);
      rowsByPageGrow.get(page)!.push(row);
    }
    for (const [pageIdx, pageRows] of rowsByPageGrow) {
      // Nur 1-spaltig-Reihen scale-uppen — 2-spaltig hat fixe Breite.
      const oneCol = pageRows.filter(
        (r) => r.getAttribute("data-layout") === "1-spaltig",
      );
      if (oneCol.length === 0) continue;
      // Max-Skala: nur die Bildhöhen skalieren, die Abstände zwischen den
      // Reihen bleiben fest — dieselbe Rechnung wie in PASS A
      // (`maxGroupScale` in imageRowLayout.ts).
      // Früher wurden die Abstände mitskaliert gerechnet; bei drei
      // Reihen auf einer Seite wuchs die Gruppe dadurch ~10 px über den
      // Inhaltsbereich hinaus in den unteren Seitenrand (Bug 2026-11-16).
      const firstTop = inFgContent(oneCol[0]);
      const pageContentBottom = pageIdx * stridePx + pageContentHeight;
      const available = pageContentBottom - firstTop;
      const maxScale = maxGroupScale(
        oneCol.length,
        available,
        naturalRowH1Col,
        sectionRowGap,
      );
      // Aktuelle Skala der Gruppe (alle Reihen auf einer Seite haben
      // nach PASS Z dieselbe). Wenn Max > aktuell + 1 %, hochskalieren.
      const currentScale =
        parseFloat(oneCol[0].style.getPropertyValue("--row-image-scale")) || 1;
      if (maxScale > currentScale + 0.01) {
        const newScale = Math.max(currentScale, Math.min(1, maxScale));
        for (const r of oneCol) {
          if (newScale >= 0.9999) {
            r.style.removeProperty("--row-image-scale");
          } else {
            r.style.setProperty("--row-image-scale", newScale.toFixed(4));
          }
        }
      }
    }
  }

  // Page-Count aus dem letzten ECHTEN Inhalt: Kopf der ersten Seite,
  // Editor-Text (inkl. leerer Absätze und manueller Umbrüche) und
  // Bildreihen mit Bildern. Leere Bild-Platzhalter und der Außenabstand
  // des letzten Absatzes zählen nicht (siehe imageRows oben). Der Inhalt
  // liegt nach der Pagination immer im Inhaltsbereich einer Seite — die
  // Seite, in der seine Unterkante liegt, ist die letzte.
  void fg.offsetHeight;
  const fgTopFinal = fg.getBoundingClientRect().top;
  let lastContentBottom = 0;
  const contentEls = [
    ...Array.from(fg.querySelectorAll<HTMLElement>("[data-first-page-header], .tiptap-editor")),
    ...imageRows,
  ];
  for (const el of contentEls) {
    const bottom = (el.getBoundingClientRect().bottom - fgTopFinal) / zoom;
    if (bottom > lastContentBottom) lastContentBottom = bottom;
  }
  const needed = Math.max(1, Math.ceil((lastContentBottom - 0.5) / stridePx));
  setPageCount((prev) => (prev !== needed ? needed : prev));
}

function cssLengthToPx(value: string, rootFontPx: number): number {
  const v = value.trim();
  const num = parseFloat(v);
  if (Number.isNaN(num)) return 0;
  if (v.endsWith("mm")) return (num / 25.4) * 96;
  if (v.endsWith("cm")) return (num / 2.54) * 96;
  if (v.endsWith("in")) return num * 96;
  if (v.endsWith("rem")) return num * rootFontPx;
  if (v.endsWith("em")) return num * rootFontPx;
  return num;
}
