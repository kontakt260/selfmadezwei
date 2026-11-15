// Kleine Zeit-Helfer für Komponenten. Der Zeitpunkt „jetzt" ist wie in
// `src/lib/email/send-welcome.ts` ein Parameter mit Default, damit die
// Berechnung in Tests deterministisch bleibt und Komponenten selbst keine
// Uhr lesen müssen (React-Regel: Rendern soll idempotent sein).

const DAY_MS = 86_400_000;

/** Volle Tage bis zum Zeitpunkt `iso`, nie negativ (0 = heute oder vorbei). */
export function daysUntil(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - now) / DAY_MS));
}

/** true, wenn der Zeitpunkt `iso` vor `now` liegt. */
export function isPast(iso: string, now: number = Date.now()): boolean {
  return new Date(iso).getTime() < now;
}
