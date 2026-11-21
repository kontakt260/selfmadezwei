// Laufzeit des Portal-Zugangs: 12 echte Kalendermonate (PROJ-6, BUG-G9).
// Fest 365 Tage hätten den Zugang über einen 29. Februar einen Tag zu früh
// beendet. Vom 29. Februar aus endet er am 28. Februar des Folgejahres.

export function addTwelveMonths(from: number | string | Date): Date {
  const date = new Date(from);
  const day = date.getUTCDate();
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  if (date.getUTCDate() !== day) date.setUTCDate(0);
  return date;
}
