import { describe, expect, it } from "vitest";
import { COVER_COLORS, getSpineColors } from "./cover-colors";

const brightness = (hex: string) => {
  const value = parseInt(hex.slice(1), 16);
  return (value >> 16) + ((value >> 8) & 255) + (value & 255);
};

describe("getSpineColors", () => {
  it("berechnet Rücken und Kante für Sand", () => {
    const sand = COVER_COLORS.find((color) => color.id === "sand")!;
    expect(getSpineColors(sand)).toEqual({ spine: "#b9a794", edge: "#9e8f7e" });
  });

  it.each(COVER_COLORS.map((color) => [color.id, color] as const))(
    "%s: Rücken ist dunkler als das Cover, die Kante noch dunkler",
    (_id, color) => {
      const { spine, edge } = getSpineColors(color);
      expect(spine).toMatch(/^#[0-9a-f]{6}$/);
      expect(edge).toMatch(/^#[0-9a-f]{6}$/);
      expect(brightness(spine)).toBeLessThan(brightness(color.surface));
      expect(brightness(edge)).toBeLessThan(brightness(spine));
    },
  );
});
