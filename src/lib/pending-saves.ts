// PROJ-30: Speichervorgänge von Editor und Cover, die gerade laufen. Wer die
// Seite kurz nach dem Tippen verlässt, darf danach nicht den Stand von vor
// diesem Speichern vom Server bekommen.
const inFlight = new Set<Promise<unknown>>();

export function trackSave<T>(save: Promise<T>): Promise<T> {
  const tracked: Promise<T> = save.finally(() => {
    inFlight.delete(tracked);
  });
  inFlight.add(tracked);
  return tracked;
}

export function hasPendingSaves(): boolean {
  return inFlight.size > 0;
}

function reportsError(value: unknown): boolean {
  return typeof value === "object" && value !== null && !!(value as { error?: unknown }).error;
}

/** Wartet auf alle laufenden Speichervorgänge. `true`, wenn einer gescheitert ist. */
export async function savesSettled(): Promise<boolean> {
  let failed = false;
  while (inFlight.size > 0) {
    const results = await Promise.allSettled([...inFlight]);
    failed ||= results.some(
      (result) => result.status === "rejected" || reportsError(result.value),
    );
  }
  return failed;
}
