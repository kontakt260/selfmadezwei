import { describe, expect, it } from "vitest";
import {
  BOOK_FONTS,
  BOOK_FONT_IDS,
  DEFAULT_BOOK_FONT,
  bookFont,
  bookFontOrDefault,
  isBookFontId,
  pageCountIsCurrent,
} from "./book-fonts";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("Buchschriften (PROJ-32)", () => {
  it("bietet PT Serif als Vorgabe und sechs Schriften in fester Reihenfolge", () => {
    expect(DEFAULT_BOOK_FONT).toBe("pt-serif");
    expect(BOOK_FONTS.map((font) => font.id)).toEqual([...BOOK_FONT_IDS]);
    expect(BOOK_FONTS.map((font) => font.label)).toEqual([
      "PT Serif",
      "Garamond",
      "Baskerville",
      "Pagella",
      "Heros",
      "Atkinson",
    ]);
  });

  it("nennt keine geschützten Schriftnamen als Namen", () => {
    for (const font of BOOK_FONTS) {
      expect(font.label).not.toMatch(/Times|Palatino|Helvetica|Arial|Georgia/i);
    }
  });

  it("hält PT Serif bei 11 pt, damit bestehende Bücher gleich bleiben", () => {
    expect(bookFont("pt-serif").scale).toBe(1);
    for (const font of BOOK_FONTS) {
      expect(font.scale).toBeGreaterThan(0.8);
      expect(font.scale).toBeLessThan(1.4);
    }
  });

  it("erkennt nur Kennungen aus der Liste", () => {
    expect(isBookFontId("garamond")).toBe(true);
    expect(isBookFontId("arial")).toBe(false);
    expect(isBookFontId(null)).toBe(false);
    expect(bookFontOrDefault("unbekannt")).toBe("pt-serif");
    expect(bookFontOrDefault(undefined)).toBe("pt-serif");
    expect(bookFontOrDefault("heros")).toBe("heros");
  });

  it("wertet eine Seitenzahl ohne Schriftangabe als mit PT Serif gemessen", () => {
    expect(pageCountIsCurrent(null, "pt-serif")).toBe(true);
    expect(pageCountIsCurrent(null, "garamond")).toBe(false);
    expect(pageCountIsCurrent("garamond", "garamond")).toBe(true);
    expect(pageCountIsCurrent("pt-serif", "pagella")).toBe(false);
  });

  it("nutzt dieselbe Liste wie die Datenbank-Prüfung", () => {
    const sql = readFileSync(
      path.join(process.cwd(), "supabase/migrations/20261124200000_proj32_book_font.sql"),
      "utf8",
    );
    const list = BOOK_FONT_IDS.map((id) => `'${id}'`).join(", ");
    // Beide Spalten prüfen genau diese Liste.
    expect(sql.split(list).length - 1).toBe(2);
  });
});
