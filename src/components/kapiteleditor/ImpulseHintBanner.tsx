"use client";

import { useEffect, useRef, useState } from "react";

// PROJ-8 — rotierender Leitfragen-Banner im Kapitel-Editor.
//
// Verhalten (aus Spec Sektion „Editor — Rotierender Leitfragen-Banner"):
//   - Sequenz: [title, ...leading_questions]  (mind. Länge 2 wenn ≥ 1 Frage)
//   - Auto-Rotation alle ~7 s (cross-fade transition)
//   - Hover oder Tastatur-Fokus pausieren die Rotation
//   - Schließen-Button (X) blendet den Banner für die Session aus
//   - Beim Editor-Mount erscheint Banner mit Sequenz-Index 0 (Titel)
//   - prefers-reduced-motion: keine Auto-Rotation, statisch nur der Titel
//   - aria-live="polite" — Screenreader liest Wechsel mit
//
// Memory-Cleanup: setInterval-Timer wird beim Unmount UND beim Schließen
// sauber abgebaut (keine Leaks bei schnellen Editor-Switches).

type Props = {
  title: string;
  leadingQuestions: readonly string[];
  /** Pause-Intervall in ms. Default 7000; override für Tests. */
  rotationIntervalMs?: number;
};

export function ImpulseHintBanner({
  title,
  leadingQuestions,
  rotationIntervalMs = 7000,
}: Props) {
  // Sequenz: erst Titel, dann alle Leitfragen in Pflege-Reihenfolge.
  const sequence: string[] = [title, ...leadingQuestions];

  const [visible, setVisible] = useState(true);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  // Eigenes State-Feld für den Cross-Fade-Trigger: kurzer „Fade out"-Frame
  // beim Wechsel, dann neuer Text + „Fade in".
  const [fading, setFading] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // prefers-reduced-motion via Standard-CSS-Media-Query.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Auto-Rotation — pausiert bei Hover/Fokus oder reduced-motion oder
  // wenn die Sequenz nur 1 Element hat (kein Wechsel sinnvoll).
  useEffect(() => {
    if (!visible || paused || reducedMotion || sequence.length <= 1) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      // Cross-Fade: kurz ausblenden, dann nächsten Index + wieder einblenden.
      setFading(true);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % sequence.length);
        setFading(false);
      }, 200);
    }, rotationIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [visible, paused, reducedMotion, sequence.length, rotationIntervalMs]);

  if (!visible) return null;
  if (sequence.length === 0) return null;

  // Reduced-motion: zeige immer den Titel (Index 0), kein Wechsel.
  const displayed = reducedMotion ? sequence[0] : sequence[index];
  const isTitle = (reducedMotion ? 0 : index) === 0;

  return (
    <div
      role="region"
      aria-label="Leitfragen-Hinweis zu diesem Impuls"
      aria-live="polite"
      aria-atomic="true"
      className="w-full max-w-2xl border border-[#e0dcd5] bg-[#FAF8F6] px-5 py-4 sm:px-6 sm:py-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      tabIndex={-1}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="[font-family:var(--font-lato)] text-xs font-semibold uppercase tracking-wide text-[#848484]">
            {isTitle ? "Erzähl-Impuls" : "Leitfrage"}
          </p>
          <p
            className={`mt-1 ${
              isTitle
                ? "[font-family:var(--font-pt-serif)] text-lg leading-7 text-[#3E3831] sm:text-xl sm:leading-8"
                : "text-base leading-7 text-[#535252] sm:text-lg sm:leading-8"
            } transition-opacity duration-200 ${fading ? "opacity-0" : "opacity-100"}`}
          >
            {displayed}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Hinweis-Banner schließen"
          className="shrink-0 -mr-1 -mt-1 flex h-8 w-8 items-center justify-center text-[#848484] transition-colors hover:bg-[#ece6df] hover:text-[#3E3831] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3E3831]"
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M3 3 13 13 M13 3 3 13" />
          </svg>
        </button>
      </div>
    </div>
  );
}
