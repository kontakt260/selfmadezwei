"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveState } from "@/lib/kapiteleditor/types";

type SaveFn<T> = (value: T) => Promise<void>;

// Auto-Save mit Debounce.
//
// Garantien (Fix 2026-11-16 — vorher gingen Änderungen der letzten
// Sekunden stillschweigend verloren, wenn die Seite verlassen wurde,
// während der Status noch „Gespeichert" zeigte):
//   - Der Status ist ehrlich: sobald sich der Wert vom zuletzt
//     gespeicherten unterscheidet, heißt er „saving" — nicht erst, wenn
//     der Debounce abgelaufen ist.
//   - Verlässt der Nutzer die Seite innerhalb der App (Unmount), wird ein
//     ausstehender Stand sofort gespeichert.
//   - Schließt oder lädt er den Tab neu, während noch etwas aussteht,
//     fragt der Browser nach; zusätzlich wird beim Verlassen ein letzter
//     Speicherversuch gestartet.
//   - Mit `enabled = false` wird nie gespeichert (PROJ-28, Lesemodus). Der
//     Editor meldet beim Öffnen sonst die berechnete Seitenzahl als Änderung.
export function useAutoSave<T>(
  value: T,
  saveFn: SaveFn<T>,
  debounceMs = 2_000,
  enabled = true,
) {
  const [savedValue, setSavedValue] = useState(value);
  const [hasSaved, setHasSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFirstRun = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(value);
  const saveFnRef = useRef(saveFn);
  // true, solange ein geänderter Wert auf seinen Debounce wartet.
  const dirtyRef = useRef(false);
  const inflightRef = useRef(0);

  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const save = useCallback(async (next: T) => {
    inflightRef.current += 1;
    try {
      await saveFnRef.current(next);
      setSavedValue(next);
      setHasSaved(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      inflightRef.current -= 1;
    }
  }, []);

  // Ausstehenden Stand sofort speichern (ohne auf den Debounce zu warten).
  const flush = useCallback(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void save(latestRef.current);
  }, [save]);

  useEffect(() => {
    latestRef.current = value;
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    if (!enabled) return;
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      dirtyRef.current = false;
      setError(null);
      void save(value);
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, debounceMs, save, enabled]);

  // Verlassen der Seite innerhalb der App.
  useEffect(() => flush, [flush]);

  // Tab schließen / neu laden.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current && inflightRef.current === 0) return;
      event.preventDefault();
      // Für ältere Browser nötig, damit die Rückfrage erscheint.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", flush);
    };
  }, [flush]);

  const retry = async () => {
    setError(null);
    await save(latestRef.current);
  };

  const pending = !Object.is(value, savedValue);
  const state: SaveState = !enabled
    ? "idle"
    : error
      ? "error"
      : pending
        ? "saving"
        : hasSaved
          ? "saved"
          : "idle";

  return { state, error, retry, saveNow: flush };
}
