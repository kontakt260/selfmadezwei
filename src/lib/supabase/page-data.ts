// PROJ-30: Gemeinsame Regeln beim Laden einer Seite.
//
// Ein Datenbankfehler ist etwas anderes als „nicht gefunden". Früher sah ein
// kurzer Aussetzer aus wie ein fehlendes Projekt oder ein leeres Buch. Jetzt
// landet er in der Fehleransicht. Details bleiben im Server-Log.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Eine ungültige ID in der Adresse ist „nicht gefunden", kein Datenbankfehler. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function assertLoaded(
  ...results: Array<{ error: { message: string } | null } | null>
): void {
  for (const result of results) {
    if (result?.error) throw new Error(`Page data failed to load: ${result.error.message}`);
  }
}
