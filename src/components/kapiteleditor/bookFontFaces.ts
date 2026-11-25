import { Atkinson_Hyperlegible, Baskervville, EB_Garamond } from "next/font/google";
import localFont from "next/font/local";

// PROJ-32: Buchschriften. Nur der Kapitel-Editor bindet dieses Modul ein, damit
// andere Seiten die Schriften nicht laden (Spec AC-20). Alle Dateien kommen vom
// eigenen Server: Die Google-Schriften holt Next.js beim Bau, Pagella und Heros
// liegen unter src/fonts/book (CTAN, GUST Font License).
// PT Serif ist schon im Root-Layout eingebunden (--font-pt-serif). Die Namen der
// Variablen stehen in src/lib/book-fonts.ts (BOOK_FONT_FAMILY_VAR).

const garamond = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-book-garamond",
  preload: false,
});

const baskerville = Baskervville({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-book-baskerville",
  preload: false,
});

const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-book-atkinson",
  preload: false,
});

const pagella = localFont({
  src: [
    { path: "../../fonts/book/texgyrepagella-regular.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/book/texgyrepagella-bold.woff2", weight: "700", style: "normal" },
    { path: "../../fonts/book/texgyrepagella-italic.woff2", weight: "400", style: "italic" },
    { path: "../../fonts/book/texgyrepagella-bolditalic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-book-pagella",
  preload: false,
  fallback: ["Palatino Linotype", "Book Antiqua", "serif"],
});

const heros = localFont({
  src: [
    { path: "../../fonts/book/texgyreheros-regular.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/book/texgyreheros-bold.woff2", weight: "700", style: "normal" },
    { path: "../../fonts/book/texgyreheros-italic.woff2", weight: "400", style: "italic" },
    { path: "../../fonts/book/texgyreheros-bolditalic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-book-heros",
  preload: false,
  fallback: ["Helvetica Neue", "Helvetica", "sans-serif"],
});

/** Klassen, die die CSS-Variablen aller Buchschriften bereitstellen. */
export const bookFontVariables = [garamond, baskerville, atkinson, pagella, heros]
  .map((font) => font.variable)
  .join(" ");
