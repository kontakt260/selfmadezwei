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
