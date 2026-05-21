// PROJ-10 Cover-Editor — kuratierte Hintergrundfarben-Palette.
//
// Code-Katalog statt DB-Tabelle: keine Laufzeit-Pflege, reviewbar in Git.
// Jeder Eintrag hat eine stabile id (in metadata.background_color persistiert),
// einen Label-Text und einen Hex-Wert.
//
// `surface` ist die Hintergrundfarbe der Vorderseite, `ink` ist die per
// Helligkeit gewählte Schriftfarbe für Titel/Untertitel/Autor (helle Tinte
// auf dunklem Grund, dunkle Tinte auf hellem Grund). `accent` wird vom
// Muster-Layer verwendet (Diamanten, Linien etc.), wenn das Muster eine
// zweite Tonierung möchte.

export type CoverColor = {
  id: string;
  label: string;
  surface: string; // Hex
  ink: string; // Hex — Text/Glyph
  accent: string; // Hex — sekundäre Akzent-Farbe für Muster
};

export const COVER_COLORS: readonly CoverColor[] = [
  {
    id: "sand",
    label: "Sand",
    surface: "#D0BCA6",
    ink: "#3E2F1F",
    accent: "#8C6A40",
  },
  {
    id: "salbei",
    label: "Salbei",
    surface: "#96B897",
    ink: "#243824",
    accent: "#4E6F4F",
  },
  {
    id: "blau-grau",
    label: "Blau-Grau",
    surface: "#597083",
    ink: "#F5EFE6",
    accent: "#B6C6D2",
  },
  {
    id: "bordeaux",
    label: "Bordeaux",
    surface: "#6B2D3F",
    ink: "#F5EFE6",
    accent: "#D0A6B2",
  },
  {
    id: "anthrazit",
    label: "Anthrazit",
    surface: "#383838",
    ink: "#F5EFE6",
    accent: "#A89F8E",
  },
  {
    id: "pastell-rose",
    label: "Pastell-Rosé",
    surface: "#E8D0CC",
    ink: "#4A2F2D",
    accent: "#A36C66",
  },
  {
    id: "eichenholz",
    label: "Eichenholz",
    surface: "#8B6F47",
    ink: "#F5EFE6",
    accent: "#D7C49B",
  },
  {
    id: "creme",
    label: "Creme",
    surface: "#F5EFE6",
    ink: "#3E3831",
    accent: "#B89A7A",
  },
] as const;

export const DEFAULT_COLOR_ID = "creme";

export function getCoverColor(id: string | null | undefined): CoverColor {
  if (!id) return COVER_COLORS.find((c) => c.id === DEFAULT_COLOR_ID)!;
  const found = COVER_COLORS.find((c) => c.id === id);
  return found ?? COVER_COLORS.find((c) => c.id === DEFAULT_COLOR_ID)!;
}
