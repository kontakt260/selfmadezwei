// Clientseitige Silbentrennung (Audit Bugs 10, 16, 2026-05-21).
//
// Browser-natives `hyphens: auto` greift nur auf das Sprach-Wörterbuch
// zurück, das via `lang`-Attribut konfiguriert ist (typischerweise nur
// EINE Sprache pro Dokument). Englische Fremdwörter und Phantasiewörter
// werden mangels passendem Dictionary nicht getrennt → in schmalen
// A5-Spalten entstehen „Rivers of Whitespace" beim Blocksatz.
//
// Hypher (clientseitig) trennt mehrsprachig (DE + EN) und injiziert
// weiche Trennzeichen (­, „soft hyphen"). Diese sind unsichtbar
// und greifen nur, wenn der Browser sie an einer Bruchstelle wirklich
// braucht. Beim Save bleiben die Soft-Hyphens im body erhalten — sie
// schaden nichts (Text-Vergleich, Wortzähler etc. ignorieren sie via
// utility-Funktion `stripSoftHyphens`).

// @ts-expect-error — hypher ships kein eigenes Types-Paket.
import Hypher from "hypher";
// @ts-expect-error — Pattern-File hat kein Types-Paket.
import germanPatterns from "hyphenation.de";
// @ts-expect-error — Pattern-File hat kein Types-Paket.
import englishPatterns from "hyphenation.en-us";

type HypherInstance = {
  hyphenateText: (text: string, minLength?: number) => string;
};

// Lazy initialisierung — die Pattern-Dictionaries sind ~70 KB groß, wir
// laden sie nur beim ersten Aufruf. Beide Sprach-Hyphenators bleiben dann
// im Module-Scope cached.
let de: HypherInstance | null = null;
let en: HypherInstance | null = null;

const getHyphenator = (lang: "de" | "en"): HypherInstance => {
  if (lang === "de") {
    if (!de) de = new Hypher(germanPatterns);
    return de!;
  }
  if (!en) en = new Hypher(englishPatterns);
  return en!;
};

// Heuristik: ein Wort gilt als „englisch", wenn es nur ASCII-Buchstaben
// enthält UND mindestens einen Klein-/Groß-Mix oder typische EN-Endungen
// (-tion, -ing, -ly, -ed) hat. Wir behandeln die OVERWHELMING majority
// von Texten weiterhin als Deutsch — EN-Erkennung greift nur dann, wenn
// das Wort klar englisch aussieht. Konservatives Verhalten ist gewollt:
// false-positives (DE-Wort als EN behandelt) brechen den Lesefluss
// stärker als false-negatives (EN-Wort wird nicht getrennt).
const looksEnglish = (word: string): boolean => {
  if (word.length < 4) return false;
  if (!/^[a-zA-Z]+$/.test(word)) return false;
  // Typische englische Wortendungen
  if (/(tion|ing|ly|ness|ment|ous|ful|ed)$/i.test(word)) return true;
  return false;
};

// Hauptfunktion: nimmt freien Text, fügt Soft-Hyphens ein. Wir splitten
// auf Wort-Grenzen, klassifizieren jedes Wort (DE vs. EN-Heuristik),
// trennen, und setzen wieder zusammen.
export function hyphenateText(text: string): string {
  if (!text) return text;
  // Schon vorhandene Soft-Hyphens entfernen, damit wir nicht doppelt
  // trennen (idempotenz für Re-Hyphenation auf bereits behandeltem Text).
  const stripped = text.replace(/­/g, "");
  // Wörter sind Sequenzen von Buchstaben/Apostrophen. Alles andere
  // (Whitespace, Interpunktion, Zahlen) bleibt unberührt.
  return stripped.replace(/[\p{L}'’]+/gu, (word) => {
    if (word.length < 6) return word; // Kurze Wörter nicht trennen
    const dict = looksEnglish(word) ? "en" : "de";
    return getHyphenator(dict).hyphenateText(word, 6);
  });
}

// Save-Helper: entfernt Soft-Hyphens vor Persistenz oder Wortzählung,
// damit Vergleiche, Search, und PDF-Renderer mit dem „nackten" Text
// arbeiten. (Aktuell save-pfad behält Soft-Hyphens — wenn der PDF-
// Renderer in PROJ-16 das nicht unterstützt, wechseln wir den
// save-pfad und nutzen diesen Helper.)
export function stripSoftHyphens(text: string): string {
  return text.replace(/­/g, "");
}
