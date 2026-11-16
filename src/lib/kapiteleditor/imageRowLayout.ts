// Seitenplanung für 1-spaltige Bildreihen im Kapitel-Editor (PROJ-5).
//
// Reine Rechenfunktionen ohne DOM — die Pagination-Engine in
// `EditorClient.tsx` misst die Geometrie und wendet das Ergebnis an.
//
// Regeln (Spec 2026-05-20):
//   - Mehrere Reihen, die sich eine Seite teilen, bekommen EINE gemeinsame
//     Skala („gleiche Größe pro Seite").
//   - Eine Gruppe darf verkleinert werden, um auf den Restplatz der Seite
//     zu passen — aber nie unter die Mindest-Skala.
//   - Skaliert werden nur die Bildhöhen. Die Abstände zwischen den Reihen
//     bleiben fest.

/** Kleinste zulässige Skala einer Bildreihe. */
export const MIN_ROW_SCALE = 0.65;

export type RowGroup = {
  /** Anzahl der Reihen in dieser Gruppe (teilen sich eine Seite). */
  count: number;
  /** Gemeinsame Skala der Gruppe, zwischen Mindest-Skala und 1. */
  scale: number;
};

export type RowPlanInput = {
  /** Anzahl der zu verteilenden Reihen. */
  rows: number;
  /** Freie Höhe auf der Seite, auf der die erste Reihe natürlich beginnt. */
  availableOnCurrentPage: number;
  /** Höhe des Inhaltsbereichs einer vollen Seite. */
  pageContentHeight: number;
  /** Natürliche Höhe einer Reihe (Skala 1). */
  rowHeight: number;
  /** Fester Abstand zwischen zwei Reihen. */
  rowGap: number;
  minScale?: number;
};

/**
 * Größte Skala (höchstens 1), mit der `rows` Reihen in `available` passen.
 * Kann unter der Mindest-Skala liegen oder negativ sein — der Aufrufer
 * entscheidet, ob das noch zulässig ist.
 */
export function maxGroupScale(
  rows: number,
  available: number,
  rowHeight: number,
  rowGap: number,
): number {
  if (rows <= 0 || rowHeight <= 0) return 1;
  return Math.min(1, (available - (rows - 1) * rowGap) / (rows * rowHeight));
}

/**
 * Verteilt die Reihen der Reihe nach auf Seiten.
 *
 * Die erste Gruppe muss in den Restplatz der aktuellen Seite passen; jede
 * weitere beginnt oben auf einer frischen Seite. Passt auf den Restplatz
 * nicht einmal eine Reihe mit Mindest-Skala, bleibt die aktuelle Seite ohne
 * Bild und die Planung beginnt auf der nächsten Seite — die Engine schiebt
 * die Reihen dann unskaliert dorthin.
 */
export function planRowGroups(input: RowPlanInput): RowGroup[] {
  const { rows, pageContentHeight, rowHeight, rowGap } = input;
  const minScale = input.minScale ?? MIN_ROW_SCALE;
  const groups: RowGroup[] = [];
  if (rows <= 0 || rowHeight <= 0) return groups;

  let placed = 0;
  let available = input.availableOnCurrentPage;
  while (placed < rows) {
    let group: RowGroup | null = null;
    // So viele Reihen wie möglich auf diese Seite: erst unskaliert,
    // sonst mit der nötigen Skala, solange sie zulässig bleibt.
    for (let count = rows - placed; count >= 1; count--) {
      const scale = maxGroupScale(count, available + 0.5, rowHeight, rowGap);
      if (scale >= 1) {
        group = { count, scale: 1 };
        break;
      }
      const exact = maxGroupScale(count, available, rowHeight, rowGap);
      if (exact >= minScale) {
        group = { count, scale: exact };
        break;
      }
    }
    if (!group) {
      if (available < pageContentHeight - 0.5) {
        // Restplatz reicht nicht → auf einer vollen Seite neu planen.
        available = pageContentHeight;
        continue;
      }
      // Volle Seite und trotzdem kein Platz (Reihe höher als die Seite):
      // eine Reihe unskaliert setzen, damit die Planung endet.
      group = { count: 1, scale: 1 };
    }
    groups.push(group);
    placed += group.count;
    available = pageContentHeight;
  }
  return groups;
}
