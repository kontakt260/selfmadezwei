import { BOOK_FONT_FAMILY_VAR, DEFAULT_BOOK_FONT, bookFont, type BookFontId } from "@/lib/book-fonts";
import { bookFontVariables } from "@/components/kapiteleditor/bookFontFaces";

// PROJ-32 (Jakob, 2026-11-25): Alle Texte auf dem Cover folgen der Buchschrift.
// Bei der Vorgabe PT Serif bleibt das Cover wie bisher: Titel und Rücken in
// Merriweather, Untertitel und Autorzeile in PT Serif.
//
// Die Schriftdateien lädt der Browser erst, wenn Text sie wirklich nutzt. Eine
// Seite mit Covern in PT Serif lädt also keine Buchschrift (Spec AC-20).

export type CoverFonts = {
  /** Klassen mit den CSS-Variablen der Buchschriften, leer bei PT Serif. */
  variables: string;
  /** Titel und Buchrücken. */
  title: string;
  /** Untertitel und Autorzeile. */
  text: string;
  /** Größe im Verhältnis zur bisherigen, gleiche x-Höhe wie im Buch. */
  scale: number;
};

const DEFAULT_FONTS: CoverFonts = {
  variables: "",
  title: "var(--font-merriweather), serif",
  text: "var(--font-pt-serif), serif",
  scale: 1,
};

export function coverFonts(font: BookFontId | undefined): CoverFonts {
  if (!font || font === DEFAULT_BOOK_FONT) return DEFAULT_FONTS;
  const family = `var(${BOOK_FONT_FAMILY_VAR[font]})`;
  return { variables: bookFontVariables, title: family, text: family, scale: bookFont(font).scale };
}
