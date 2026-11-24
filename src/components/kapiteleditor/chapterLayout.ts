import { planRowGroups } from "@/lib/kapiteleditor/imageRowLayout";

// PROJ-34: Bildreihen und manuelle Seitenumbrüche im Seiten-Takt.
//
// Die Textberechnung (computeDecorations) läuft von oben nach unten durch das
// Kapitel und ruft für jeden Bildabschnitt und Umbruch diese Berechnung auf.
// Beide bleiben getrennt, aber jeder Schritt hängt nur von dem ab, was darüber
// steht. Früher rechneten sie abwechselnd über das ganze Kapitel und brauchten
// für jeden Abschnitt eine weitere Runde.

export type PageGeometry = {
  stride: number;
  marginTop: number;
  contentHeight: number;
};

/** Abstand zwischen zwei Bildreihen (4 mm). */
const ROW_GAP = (4 / 25.4) * 96;

type PlacedRow = { row: HTMLElement; page: number; scale: number; scalable: boolean };

export type BlockPlacer = {
  /** `shift`: Höhe der Textumbrüche darüber, die erst danach eingefügt werden. */
  place: (kind: "pageBreak" | "imageSection", dom: HTMLElement, shift: number) => void;
  rows: PlacedRow[];
};

export function resetImageRows(fg: HTMLElement): void {
  for (const row of fg.querySelectorAll<HTMLElement>("[data-paginate-row]")) {
    if (row.style.marginTop) row.style.marginTop = "";
    if (row.style.getPropertyValue("--row-image-scale")) {
      row.style.removeProperty("--row-image-scale");
    }
  }
  void fg.offsetHeight;
}

export function createBlockPlacer(
  fg: HTMLElement,
  geometry: PageGeometry,
  zoom: number,
  scaleCaps: Map<HTMLElement, number>,
): BlockPlacer {
  const { stride, marginTop, contentHeight } = geometry;
  const fgTop = fg.getBoundingClientRect().top;
  const rows: PlacedRow[] = [];

  const topOf = (el: HTMLElement, shift: number) =>
    (el.getBoundingClientRect().top - fgTop) / zoom + shift;
  const heightOf = (el: HTMLElement) => el.getBoundingClientRect().height / zoom;
  const pageAt = (y: number) => Math.max(0, Math.floor(y / stride));
  const contentTop = (page: number) => page * stride + marginTop;
  const contentBottom = (page: number) => contentTop(page) + contentHeight;

  const moveDown = (row: HTMLElement, by: number) => {
    const current = parseFloat(getComputedStyle(row).marginTop) || 0;
    row.style.marginTop = `${current + by}px`;
  };

  const placePageBreak = (el: HTMLElement, shift: number) => {
    const y = topOf(el, shift) - marginTop;
    const frame = Math.max(0, Math.floor(y / stride));
    const atFrameTop = Math.abs(y - Math.round(y / stride) * stride) < 1;
    // Steht der Umbruch ganz oben auf einer Seite, bleibt diese Seite bewusst leer.
    const height = atFrameTop ? stride : (frame + 1) * stride - y;
    if (Math.abs(height - heightOf(el)) > 0.5) el.style.height = `${height}px`;
  };

  const placeImageSection = (wrapper: HTMLElement, shift: number) => {
    const sectionRows = Array.from(wrapper.querySelectorAll<HTMLElement>("[data-paginate-row]"));
    if (sectionRows.length === 0) return;
    const scalable = sectionRows[0].getAttribute("data-layout") === "1-spaltig";

    // Einzelne Bilder dürfen kleiner werden, um noch auf die Seite zu passen.
    if (scalable) {
      const firstTop = topOf(sectionRows[0], shift);
      const groups = planRowGroups({
        rowHeights: sectionRows.map(heightOf),
        availableOnCurrentPage: Math.max(0, contentBottom(pageAt(firstTop)) - firstTop),
        pageContentHeight: contentHeight,
        rowGap: ROW_GAP,
      });
      let cursor = 0;
      for (const group of groups) {
        for (const row of sectionRows.slice(cursor, cursor + group.count)) {
          const scale = Math.min(group.scale, scaleCaps.get(row) ?? 1);
          if (scale < 1) row.style.setProperty("--row-image-scale", scale.toFixed(4));
        }
        cursor += group.count;
      }
    }

    // Was nicht passt, rückt auf die nächste Seite. Kein Foto wird geteilt.
    for (const row of sectionRows) {
      let y = topOf(row, shift);
      const height = heightOf(row);
      let page = pageAt(y);
      if (y < contentTop(page) - 0.5) {
        moveDown(row, contentTop(page) - y);
        y = contentTop(page);
      }
      if (y + height > contentBottom(page) + 1 && height <= contentHeight + 0.5) {
        moveDown(row, contentTop(page + 1) - y);
        page += 1;
      }
      rows.push({
        row,
        page,
        scalable,
        scale: parseFloat(row.style.getPropertyValue("--row-image-scale")) || 1,
      });
    }
  };

  return {
    rows,
    place: (kind, dom, shift) => {
      if (kind === "pageBreak") placePageBreak(dom, shift);
      else placeImageSection(dom, shift);
    },
  };
}

/** Bilder auf derselben Seite sind gleich stark verkleinert. */
export function unevenPageScales(rows: PlacedRow[]): Map<HTMLElement, number> {
  const byPage = new Map<number, PlacedRow[]>();
  for (const entry of rows) {
    if (!entry.scalable) continue;
    byPage.set(entry.page, [...(byPage.get(entry.page) ?? []), entry]);
  }
  const caps = new Map<HTMLElement, number>();
  for (const pageRows of byPage.values()) {
    const smallest = Math.min(...pageRows.map((entry) => entry.scale));
    if (pageRows.every((entry) => entry.scale - smallest < 0.001)) continue;
    for (const entry of pageRows) caps.set(entry.row, smallest);
  }
  return caps;
}

/** Seitenzahl aus dem letzten echten Inhalt. */
export function measurePageCount(
  fg: HTMLElement,
  editorDom: HTMLElement,
  stride: number,
  zoom: number,
): number {
  const fgTop = fg.getBoundingClientRect().top;
  const elements = [
    ...Array.from(fg.querySelectorAll<HTMLElement>("[data-first-page-header]")),
    ...(Array.from(editorDom.children) as HTMLElement[]).filter(
      (el) =>
        !el.classList.contains("a5-block-push-spacer") &&
        // Die leere Zeile hinter einem Abschnitt am Ende erzeugt keine eigene Seite.
        !el.classList.contains("a5-trailing-line"),
    ),
  ];
  let lastBottom = 0;
  for (const el of elements) {
    lastBottom = Math.max(lastBottom, (el.getBoundingClientRect().bottom - fgTop) / zoom);
  }
  return Math.max(1, Math.ceil((lastBottom - 0.5) / stride));
}
