/** Vorgeschlagene Kapitelthemen für Erzähl-Impulse (Biografie / Lebensgeschichte).
 *
 * PROJ-8: Die Inhalte liegen in der Tabelle `impulse_catalog` mit den Feldern
 * `title`, `category` und `leading_questions` (Array).
 *
 * Pflege-Konvention: leading_questions enthält 1 bis ~4 Fragen pro Impuls.
 * Erste Frage (Index 0) ist der „Vorgeschmack" im Shuffle-Modal; alle Fragen
 * werden im Editor-Banner zyklisch rotiert.
 */
export type ErzaehlImpuls = {
  /** Stabile ID — wird in /backend zur UUID aus impulse_catalog.id; in der
   * Frontend-Phase reicht ein Slug für die Optimistic-Add-Pipeline. */
  id: string;
  title: string;
  category: string;
  leading_questions: readonly string[];
};
