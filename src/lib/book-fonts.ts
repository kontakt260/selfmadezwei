// PROJ-32: Buchschriften. Eine Schrift gilt für das ganze Buch (projects.book_font).
// Diese Liste ist die einzige Quelle: Auswahlfeld, Server-Prüfung und Gestaltung
// lesen sie. Die Datenbank prüft dieselben Kennungen (Migration
// 20261124200000_proj32_book_font.sql).

export const BOOK_FONT_IDS = ["pt-serif", "garamond", "baskerville", "pagella", "heros", "atkinson"] as const;

export type BookFontId = (typeof BOOK_FONT_IDS)[number];

export const DEFAULT_BOOK_FONT: BookFontId = "pt-serif";

export type BookFont = {
  id: BookFontId;
  /** Name im Auswahlfeld. Markennamen anderer Schriften kommen hier nie vor. */
  label: string;
  /** Kurzer Hinweis neben dem Namen. */
  hint: string;
  /** Schriftgröße im Verhältnis zu 11 pt. Gleiche x-Höhe wie PT Serif, gemessen 2026-11-24. */
  scale: number;
};

export const BOOK_FONTS: readonly BookFont[] = [
  { id: "pt-serif", label: "PT Serif", hint: "Vorgabe", scale: 1 },
  { id: "garamond", label: "Garamond", hint: "klassisch", scale: 13.5 / 11 },
  { id: "baskerville", label: "Baskerville", hint: "klassisch", scale: 12.5 / 11 },
  { id: "pagella", label: "Pagella", hint: "wie Palatino", scale: 11.75 / 11 },
  { id: "heros", label: "Heros", hint: "ohne Serifen", scale: 10.5 / 11 },
  { id: "atkinson", label: "Atkinson", hint: "ohne Serifen, gut lesbar", scale: 1 },
];

/**
 * CSS-Variable mit der Schriftfamilie je Buchschrift. Gesetzt von next/font im
 * Root-Layout (PT Serif) und in src/components/kapiteleditor/bookFontFaces.ts.
 */
export const BOOK_FONT_FAMILY_VAR: Record<BookFontId, string> = {
  "pt-serif": "--font-pt-serif",
  garamond: "--font-book-garamond",
  baskerville: "--font-book-baskerville",
  pagella: "--font-book-pagella",
  heros: "--font-book-heros",
  atkinson: "--font-book-atkinson",
};

export function isBookFontId(value: unknown): value is BookFontId {
  return typeof value === "string" && (BOOK_FONT_IDS as readonly string[]).includes(value);
}

/** Unbekannte oder fehlende Werte (alte Daten) gelten als Vorgabe. */
export function bookFontOrDefault(value: unknown): BookFontId {
  return isBookFontId(value) ? value : DEFAULT_BOOK_FONT;
}

export function bookFont(id: BookFontId): BookFont {
  return BOOK_FONTS.find((font) => font.id === id) ?? BOOK_FONTS[0];
}

/** Seitenzahl eines Kapitels ist veraltet, wenn sie mit einer anderen Schrift gemessen wurde. */
export function pageCountIsCurrent(pageCountFont: string | null | undefined, book: BookFontId): boolean {
  return bookFontOrDefault(pageCountFont) === book;
}
