// PROJ-25: Seiten-Takt des Kapitel-Editors.
//
// Text und Bilder haben je eine eigene Seitenberechnung, die vom Ergebnis der
// anderen abhängt: Der Text steht unter den Bildern am Kapitelanfang, die
// Bilder am Ende stehen unter dem Text. Früher stießen sich beide über Events
// und Timer gegenseitig an, und der Browser zeichnete jeden Zwischenstand. Das
// war das Springen der Bilder.
//
// Der Takt sammelt alle Auslöser und rechnet höchstens einmal pro Bild, in
// fester Reihenfolge und vollständig VOR dem Zeichnen. So wird nur das
// Endergebnis sichtbar. Die Zahl der Runden ist begrenzt, damit zwei Zustände
// an einer Seitengrenze den Editor nie in eine Endlosschleife bringen.

export const MAX_LAYOUT_ROUNDS = 4;

export type PageLayoutSteps = {
  /** `false`, solange der Editor nicht sichtbar ist (zum Beispiel auf dem Phone). */
  isVisible: () => boolean;
  /** Bildreihen und manuelle Seitenumbrüche. */
  images: () => void;
  /** Zeilenweise Textumbrüche. */
  text: () => void;
  /** Was die Bildberechnung gesetzt hat. */
  imageSignature: () => string;
  /** Was die Textberechnung gesetzt hat. */
  textSignature: () => string;
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
    // Jede Berechnung läuft nur erneut, wenn die andere wirklich etwas geändert
    // hat. Beim normalen Tippen bleibt es so bei einem kurzen Durchgang.
    steps.images();
    for (let round = 0; round < MAX_LAYOUT_ROUNDS; round += 1) {
      const textBefore = steps.textSignature();
      steps.text();
      if (steps.textSignature() === textBefore) break;
      const imagesBefore = steps.imageSignature();
      steps.images();
      if (steps.imageSignature() === imagesBefore) break;
    }
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
