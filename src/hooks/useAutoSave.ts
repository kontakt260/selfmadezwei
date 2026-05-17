"use client";

import { useEffect, useRef, useState } from "react";
import type { SaveState } from "@/lib/kapiteleditor/types";

type SaveFn<T> = (value: T) => Promise<void>;

export function useAutoSave<T>(value: T, saveFn: SaveFn<T>, debounceMs = 2_000) {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const isFirstRun = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    setState((prev) => (prev === "error" ? "error" : prev));

    timerRef.current = setTimeout(async () => {
      setState("saving");
      setError(null);
      const op = saveFn(value)
        .then(() => setState("saved"))
        .catch((err: unknown) => {
          setState("error");
          setError(err instanceof Error ? err.message : "Unbekannter Fehler");
        });
      inflightRef.current = op;
      await op;
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const retry = async () => {
    setState("saving");
    setError(null);
    try {
      await saveFn(value);
      setState("saved");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  };

  return { state, error, retry };
}
