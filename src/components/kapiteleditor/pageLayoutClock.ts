// PROJ-25: Seiten-Takt des Kapitel-Editors.
//
// Früher stießen sich Text- und Bildberechnung über Events und Timer gegenseitig
// an, und der Browser zeichnete jeden Zwischenstand. Das war das Springen der
// Bilder. Der Takt sammelt alle Auslöser und rechnet höchstens einmal pro Bild,
// vollständig VOR dem Zeichnen. So wird nur das Endergebnis sichtbar.
//
// PROJ-34: Die Berechnung läuft in Lesereihenfolge (siehe chapterLayout.ts) und
// braucht deshalb keine Wiederholungen mehr, auch mit vielen Bildern im Text.

export type PageLayoutSteps = {
  /** `false`, solange der Editor nicht sichtbar ist (zum Beispiel auf dem Phone). */
  isVisible: () => boolean;
  /** Text, Bildreihen und Umbrüche von oben nach unten. */
  layout: () => void;
  /** Läuft nach jedem fertigen Durchgang. */
  onSettled?: () => void;
};

export type PageLayoutClock = {
  /** Fordert eine Berechnung im nächsten Bild an. Mehrfache Aufrufe zählen einmal. */
  request: () => void;
  destroy: () => void;
};

export function createPageLayoutClock(
  steps: PageLayoutSteps,
  schedule: (run: () => void) => number = (run) => requestAnimationFrame(run),
  cancel: (frame: number) => void = (frame) => cancelAnimationFrame(frame),
): PageLayoutClock {
  let frame: number | null = null;
  let destroyed = false;

  const run = () => {
    frame = null;
    if (destroyed || !steps.isVisible()) return;
    steps.layout();
    steps.onSettled?.();
  };

  return {
    request() {
      if (destroyed || frame !== null) return;
      frame = schedule(run);
    },
    destroy() {
      destroyed = true;
      if (frame !== null) cancel(frame);
      frame = null;
    },
  };
}
