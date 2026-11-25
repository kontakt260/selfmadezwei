import { describe, expect, it } from "vitest";
import { coverFonts } from "./coverFonts";

describe("Cover-Schriften (PROJ-32)", () => {
  it("lässt das Cover bei PT Serif und ohne Angabe wie bisher", () => {
    for (const font of [undefined, "pt-serif"] as const) {
      expect(coverFonts(font)).toEqual({
        variables: "",
        title: "var(--font-merriweather), serif",
        text: "var(--font-pt-serif), serif",
        scale: 1,
      });
    }
  });

  it("setzt alle Texte in die Buchschrift, mit ihrer Größe", () => {
    const fonts = coverFonts("garamond");
    expect(fonts.title).toBe("var(--font-book-garamond)");
    expect(fonts.text).toBe("var(--font-book-garamond)");
    expect(fonts.scale).toBeCloseTo(13.5 / 11);
    expect(coverFonts("heros").title).toBe("var(--font-book-heros)");
  });
});
