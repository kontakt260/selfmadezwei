// PROJ-11 — gemeinsame Formatierung für Mail-Inhalte.
//
// Datumsangaben immer in deutscher Zeit: Der Server läuft in UTC, ein
// Zugang, der um 23:30 Uhr deutscher Zeit abläuft, soll in der Mail nicht
// mit dem Vortag erscheinen.

const TIME_ZONE = "Europe/Berlin";

export function formatEur(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

export function formatGermanDate(iso: string | number | Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

/** Laufende Nummer des Kalendertags in deutscher Zeit. */
function germanDayNumber(value: string | number | Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).formatToParts(new Date(value));
  const part = (type: "year" | "month" | "day") =>
    Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / (24 * 60 * 60 * 1000);
}

/**
 * Kalendertage von `now` bis `target` in deutscher Zeit. Damit passt die
 * Angabe „in 19 Tagen" zum Datum, das in derselben Mail steht.
 */
export function calendarDaysUntil(
  target: string | number | Date,
  now: string | number | Date = Date.now(),
): number {
  return germanDayNumber(target) - germanDayNumber(now);
}
