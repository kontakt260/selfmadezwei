import { describe, expect, it } from "vitest";
import { bookFontStyle, primaryFamily } from "./loadBookFont";

describe("Buchschrift laden (PROJ-32)", () => {
  it("liest die erste Familie aus der Schriftliste", () => {
    expect(primaryFamily("'__EB_Garamond_1a2b3c', '__EB_Garamond_Fallback_1a2b3c'")).toBe(
      "__EB_Garamond_1a2b3c",
    );
    expect(primaryFamily(' "TeX Gyre Pagella" , serif')).toBe("TeX Gyre Pagella");
    expect(primaryFamily("")).toBeNull();
  });

  it("setzt für PT Serif keine Variablen, damit alles wie bisher aussieht", () => {
    expect(bookFontStyle("pt-serif")).toEqual({});
  });

  it("setzt Schrift, Titelschrift und Größe für andere Schriften", () => {
    const style = bookFontStyle("garamond");
    expect(style["--book-font"]).toBe("var(--font-book-garamond)");
    expect(style["--book-title-font"]).toBe("var(--font-book-garamond)");
    expect(Number(style["--book-scale"])).toBeCloseTo(13.5 / 11);
  });
});
