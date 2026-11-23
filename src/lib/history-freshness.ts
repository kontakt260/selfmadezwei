// PROJ-30: Seiten mit Kundendaten, die nach Zurück und Vorwärts immer den
// aktuellen Stand vom Server zeigen. Öffentliche Seiten wie Anmeldung und
// Onboarding halten ihren Stand selbst und bleiben außen vor.
export function isFreshDataRoute(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/persoenlicher-bereich" ||
    pathname.startsWith("/persoenlicher-bereich/") ||
    pathname.startsWith("/projektuebersicht/")
  );
}
