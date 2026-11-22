/**
 * Abgesendeter Text für die Anzeige nach einem Fehler.
 *
 * React leert ein Formular nach jeder Server Action und setzt die Felder auf
 * ihren `defaultValue`. Gibt die Action den Wert zurück, bleibt er stehen. Die
 * Felder bleiben dabei ungesteuert, sonst ginge Text verloren, der vor dem
 * Laden des JavaScripts getippt oder vom Passwort-Manager eingetragen wurde.
 *
 * Nie für Passwörter verwenden.
 */
export function submittedText(formData: FormData, name: string, maxLength = 320): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}
