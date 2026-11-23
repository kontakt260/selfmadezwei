import { calendarDaysUntil, formatGermanDate } from "@/lib/email/format";
import { isAccessExpired } from "@/lib/projects/project-access";

// PROJ-22: Was die Projektkarte auf der Startseite über ein Projekt anzeigt.

export type ProjectCardAccess =
  | { state: "active" }
  | { state: "expired"; expiredOn: string }
  /** Der Zugang ließ sich nicht laden. Die Projektseite entscheidet selbst. */
  | { state: "unknown" };

/** Zählt Kalendertage in deutscher Zeit, nicht 24-Stunden-Abschnitte. */
export function formatLastEdited(
  editedAt: string,
  now: string | number | Date = Date.now(),
): string {
  const days = Math.max(0, calendarDaysUntil(now, editedAt));
  if (days === 0) return "Zuletzt bearbeitet: heute";
  if (days === 1) return "Zuletzt bearbeitet: gestern";
  if (days < 7) return `Zuletzt bearbeitet: vor ${days} Tagen`;
  if (days < 14) return "Zuletzt bearbeitet: vor 1 Woche";
  if (days < 30) return `Zuletzt bearbeitet: vor ${Math.floor(days / 7)} Wochen`;
  if (days < 60) return "Zuletzt bearbeitet: vor 1 Monat";
  return `Zuletzt bearbeitet: vor ${Math.floor(days / 30)} Monaten`;
}

export function projectCardAccess(
  expiresAt: string | null | undefined,
  loadFailed: boolean,
  now: number = Date.now(),
): ProjectCardAccess {
  if (loadFailed) return { state: "unknown" };
  if (expiresAt && isAccessExpired(expiresAt, now)) {
    return { state: "expired", expiredOn: formatGermanDate(expiresAt) };
  }
  return { state: "active" };
}
